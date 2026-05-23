// Backbar fleet node — ESP32-S3.
//
// Spec: ../../specs/firmware.md + backbar-architecture-spec.md §4.
//
// Per channel, every loop:
//   1. read HX711 raw counts
//   2. apply per-channel cal_slope/cal_offset → grams
//   3. settle detection (ε for N seconds) — drop the pour transient, keep the rest
//   4. publish JSON {channel, raw_g, ts} to backbar/<device_id>/reading (retained)
// Plus: birth on connect, LWT for offline, subscribe config topic for cal push.
//
// secrets.h provides Wi-Fi + broker creds + device_id; not committed.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HX711.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <WiFi.h>

#include "secrets.h"  // defines WIFI_SSID, WIFI_PASS, MQTT_HOST, MQTT_PORT, DEVICE_ID, FW_VERSION

// ─── Channel wiring (single-board P2a — HX711 per cell). ───────────────────
// Each row: { DOUT pin, SCK pin }. ESP32-S3 free GPIOs vary by board; adjust.
struct ChannelPins {
  uint8_t dout;
  uint8_t sck;
};
static const ChannelPins CHANNEL_PINS[] = {
    {4, 5},
    {6, 7},
    {15, 16},
    {17, 18},
};
constexpr size_t CHANNEL_COUNT = sizeof(CHANNEL_PINS) / sizeof(CHANNEL_PINS[0]);

// ─── Settle detection (see specs/firmware.md §4). ──────────────────────────
constexpr float SETTLE_EPSILON_G = 2.0f;       // load-cell noise floor at typical gain
constexpr float SETTLE_WINDOW_S = 2.0f;        // sustained quiet before we commit
constexpr float EMIT_DELTA_G = 1.0f;           // change required to republish
constexpr uint32_t HEARTBEAT_S_DEFAULT = 300;  // republish current state every N s
constexpr uint32_t SAMPLE_INTERVAL_MS = 100;   // 10 Hz inner loop
constexpr size_t SETTLE_WINDOW_SAMPLES =
    static_cast<size_t>(SETTLE_WINDOW_S * 1000.0f / SAMPLE_INTERVAL_MS);

struct ChannelState {
  HX711 scale;
  float cal_slope = 1.0f;   // pushed from server via `config` topic
  float cal_offset = 0.0f;  // (and persisted to NVS for cold-boot)
  float ring[SETTLE_WINDOW_SAMPLES] = {};
  size_t ring_idx = 0;
  size_t ring_filled = 0;
  float last_emit_g = NAN;
  uint32_t last_emit_ms = 0;
};
static ChannelState channels[CHANNEL_COUNT];
static uint32_t heartbeat_s = HEARTBEAT_S_DEFAULT;

WiFiClient wifi;
PubSubClient mqtt(wifi);
Preferences prefs;

// ─── Topic helpers. ────────────────────────────────────────────────────────
static String topicReading;
static String topicBirth;
static String topicLwt;
static String topicConfig;

static void buildTopics() {
  topicReading = String("backbar/") + DEVICE_ID + "/reading";
  topicBirth = String("backbar/") + DEVICE_ID + "/birth";
  topicLwt = String("backbar/") + DEVICE_ID + "/lwt";
  topicConfig = String("backbar/") + DEVICE_ID + "/config";
}

// ─── NVS persistence for calibration. ──────────────────────────────────────
// Layout: keys "s<channel>" = slope (float), "o<channel>" = offset (float).
static void loadCalFromNvs() {
  prefs.begin("backbar", true);
  for (size_t i = 0; i < CHANNEL_COUNT; i++) {
    char ks[8];
    char ko[8];
    snprintf(ks, sizeof(ks), "s%u", static_cast<unsigned>(i));
    snprintf(ko, sizeof(ko), "o%u", static_cast<unsigned>(i));
    channels[i].cal_slope = prefs.getFloat(ks, 1.0f);
    channels[i].cal_offset = prefs.getFloat(ko, 0.0f);
  }
  prefs.end();
}

static void saveCalToNvs(size_t i, float slope, float offset) {
  prefs.begin("backbar", false);
  char ks[8];
  char ko[8];
  snprintf(ks, sizeof(ks), "s%u", static_cast<unsigned>(i));
  snprintf(ko, sizeof(ko), "o%u", static_cast<unsigned>(i));
  prefs.putFloat(ks, slope);
  prefs.putFloat(ko, offset);
  prefs.end();
}

// ─── HX711 read + cal application. ─────────────────────────────────────────
static bool readChannelGrams(size_t i, float& grams_out) {
  ChannelState& ch = channels[i];
  if (!ch.scale.is_ready()) return false;
  long raw = ch.scale.read();
  grams_out = static_cast<float>(raw) * ch.cal_slope + ch.cal_offset;
  return true;
}

// ─── Settle detection (specs/firmware.md §4). ──────────────────────────────
static bool feedAndCheckSettle(ChannelState& ch, float grams, float& settled_g_out) {
  ch.ring[ch.ring_idx] = grams;
  ch.ring_idx = (ch.ring_idx + 1) % SETTLE_WINDOW_SAMPLES;
  if (ch.ring_filled < SETTLE_WINDOW_SAMPLES) ch.ring_filled++;
  if (ch.ring_filled < SETTLE_WINDOW_SAMPLES) return false;

  float lo = ch.ring[0];
  float hi = ch.ring[0];
  float sum = 0;
  for (size_t i = 0; i < SETTLE_WINDOW_SAMPLES; i++) {
    float v = ch.ring[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    sum += v;
  }
  if ((hi - lo) > SETTLE_EPSILON_G) return false;
  settled_g_out = sum / static_cast<float>(SETTLE_WINDOW_SAMPLES);
  return true;
}

// ─── MQTT publish — JSON payload server expects (ReadingPayload). ──────────
// Server parses `{channel, raw_g, ts}` with ts in ms-since-epoch (or any
// monotonic stamp; server falls back to Date.now() if ts is omitted).
static void publishReading(size_t channel, float grams, uint32_t ts_ms) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<128> doc;
  doc["channel"] = static_cast<unsigned>(channel);
  doc["raw_g"] = grams;
  doc["ts"] = ts_ms;
  char buf[128];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicReading.c_str(), reinterpret_cast<const uint8_t*>(buf), n, /*retain=*/true);
}

static void publishBirth() {
  StaticJsonDocument<96> doc;
  doc["fw_version"] = FW_VERSION;
  char buf[96];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicBirth.c_str(), reinterpret_cast<const uint8_t*>(buf), n, /*retain=*/true);
}

// ─── Config topic handler (cal push + cadence). ────────────────────────────
static void onConfigMessage(byte* payload, unsigned int length) {
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[mqtt] bad config payload: %s\n", err.c_str());
    return;
  }
  if (doc["cadence_s"].is<uint32_t>()) {
    heartbeat_s = doc["cadence_s"].as<uint32_t>();
  }
  if (doc["cal"].is<JsonArray>()) {
    for (JsonObject c : doc["cal"].as<JsonArray>()) {
      size_t ch = c["channel"].as<size_t>();
      if (ch >= CHANNEL_COUNT) continue;
      float slope = c["slope"].as<float>();
      float offset = c["offset"].as<float>();
      channels[ch].cal_slope = slope;
      channels[ch].cal_offset = offset;
      saveCalToNvs(ch, slope, offset);
      Serial.printf("[cal] ch=%u slope=%.6f offset=%.6f\n",
                    static_cast<unsigned>(ch), slope, offset);
    }
  }
}

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (topicConfig.equals(topic)) {
    onConfigMessage(payload, length);
  }
}

// ─── Connection lifecycle. ─────────────────────────────────────────────────
static void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < 20000) {
    delay(250);
  }
  Serial.printf("[wifi] %s\n", WiFi.status() == WL_CONNECTED ? "connected" : "timeout");
}

static void connectMqtt() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(1024);

  while (!mqtt.connected()) {
    // LWT = retained empty payload on `lwt` topic. Server reads any message on
    // that topic as "node went away."
    bool ok = mqtt.connect(DEVICE_ID, /*user=*/nullptr, /*pass=*/nullptr,
                           topicLwt.c_str(), /*willQos=*/1, /*willRetain=*/true,
                           /*willMessage=*/"");
    if (ok) {
      publishBirth();
      mqtt.subscribe(topicConfig.c_str(), /*qos=*/1);
      Serial.println("[mqtt] connected + subscribed config");
    } else {
      Serial.printf("[mqtt] connect failed rc=%d retrying in 2s\n", mqtt.state());
      delay(2000);
    }
  }
}

// ─── Arduino setup / loop. ─────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("[boot] backbar node %s fw=%s\n", DEVICE_ID, FW_VERSION);

  for (size_t i = 0; i < CHANNEL_COUNT; i++) {
    channels[i].scale.begin(CHANNEL_PINS[i].dout, CHANNEL_PINS[i].sck);
  }
  loadCalFromNvs();
  buildTopics();
  connectWifi();
  connectMqtt();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }
  if (!mqtt.connected()) {
    connectMqtt();
  }
  mqtt.loop();

  static uint32_t next_sample_ms = 0;
  uint32_t now = millis();
  if (now < next_sample_ms) {
    delay(1);
    return;
  }
  next_sample_ms = now + SAMPLE_INTERVAL_MS;

  for (size_t i = 0; i < CHANNEL_COUNT; i++) {
    float grams;
    if (!readChannelGrams(i, grams)) continue;

    float settled;
    bool stable = feedAndCheckSettle(channels[i], grams, settled);
    if (!stable) continue;

    bool first = isnan(channels[i].last_emit_g);
    bool changed = first || fabsf(settled - channels[i].last_emit_g) >= EMIT_DELTA_G;
    bool heartbeat = (now - channels[i].last_emit_ms) >= heartbeat_s * 1000UL;
    if (!changed && !heartbeat) continue;

    publishReading(i, settled, now);
    channels[i].last_emit_g = settled;
    channels[i].last_emit_ms = now;
  }
}
