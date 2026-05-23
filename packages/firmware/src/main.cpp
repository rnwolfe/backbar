// Backbar fleet node — ESP32-S3
// Scaffolded; implementation in task-008.
// Responsibilities per spec §4:
//   - HX711 (or ADS1256) read per channel; cal_slope/offset applied
//   - Settle detection (ε for N seconds) before publishing
//   - MQTT pub `backbar/<device_id>/reading` {channel, raw_g, ts}
//   - Birth + last-will topics for fleet health
//   - Subscribe `backbar/<device_id>/config` for cadence + cal push
#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  Serial.println("backbar node — placeholder");
}

void loop() {
  delay(1000);
}
