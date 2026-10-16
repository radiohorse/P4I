// DM2008 — Activity 8b
// Type 3: Ultrasonic Sensor (10 min)

// sensor connected to analog pin A0
const int ultraPin = A0; 

void setup() {
  Serial.begin(9600);
}

void loop() {
  int duration = analogRead(ultraPin);             // raw reading from the sensor
  float distanceCM = (duration * 520.0) / 1023.0; // convert to centimeters

  // Clamp to the sensor's reliable range
  if (distanceCM < 2) {
  	distanceCM = 2;
  }
  if (distanceCM > 500) {
  	return;
  }

  // Print label and value on the same line, then move to the next line
  Serial.print("Distance: ");
  Serial.print(distanceCM, 1);
  Serial.println(" cm");

  delay(100);
}