// DM2008 — Activity 8a
// Combination Challenge (15 min)
//
// The always-on LED is handled purely by wiring (5V rail) — no code needed for that one.

int fadeLED = 9;     // PWM pin for fade control (~)
int blinkLED = 13;   // Digital pin for on/off blink

int brightness = 0;  // current brightness level (0–255)
int fadeAmount = 3;  // how much brightness changes each step

void setup() {
  pinMode(fadeLED, OUTPUT);
  pinMode(blinkLED, OUTPUT);
}

void loop() {
  // Blink LED
  digitalWrite(blinkLED, HIGH);
  delay(100);
  digitalWrite(blinkLED, LOW);
  delay(100);

  // Fade LED
  analogWrite(fadeLED, brightness);
  brightness += fadeAmount;

  // Reverse direction at brightness limits
  if (brightness <= 0 || brightness >= 155) {
    fadeAmount = -fadeAmount;
  }

  delay(10);
}