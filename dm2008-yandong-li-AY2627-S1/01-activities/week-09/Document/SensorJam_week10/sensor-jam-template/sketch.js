let port; // Serial Communication port
let connectBtn;
let wasOpened = false; // tracks port state to update the button label

let sensorVal;
let circleSize = 50;
let targetSize = 50; // used for Option 2
let rectwidth = 25;
let rectheight = 25;
let rectcolor = 20;
let circolor = 100;

function setup() {
  createCanvas(windowWidth, windowHeight);
  port = createSerial(); // creates the Serial Port

  // Connection helpers
  connectBtn = createButton("Connect to Arduino");
  connectBtn.position(20, 20);
  connectBtn.mousePressed(connectBtnClick);
}

function draw() {
  background(10);
  push();
  fill(circolor,150,10,250);
  ellipse(width / 2, height / 2, circleSize);
  pop();

  rectMode(CENTER);
  push();

  for(let i = 0; i < 10; i++){
    fill(rectcolor,100,150,170);
    rect(width /2 * i/5, height / 2 * i/6, rectwidth, rectheight);
  }
  
  pop();

  updateConnectBtn();

  // Receive data from Arduino
  if (port.opened()) {
    sensorVal = port.readUntil("\n");
    // Only log data that has information, not empty signals
    if (sensorVal[0]) {
      // Once you verify data is coming in,
      // disable logging to improve performance
      console.log(sensorVal);

      // use float() to convert the data from string to number
      // (Arduino must send ONE number per line, e.g. Serial.println(distVal))
      let val = float(sensorVal);

      // Ignore anything that isn't a number (e.g. stray text or a partial line)
      if (!isNaN(val)) {
        // OPTION 1:
        // Update circle's size with sensor's data directly
        // Reduce delay() value in Arduino to get smoother changes
        // circleSize = val;

        // OPTION 2:
        // Update circle's size using lerp() to smoothly change values
        // This method even works with longer delay() values in Arduino

        // map distance (5-100cm) to circle size: closer = bigger
        targetSize = map(val, 5, 100, 800, 10);
        rtargetSize = map(val, 5, 100, 150, 1);
        targetcolor = map(val, 5, 100, 255, 1);
        ctargetcolor = map(val, 5, 100, 50, 155);
        // last value in lerp() controls speed of change
        circleSize = lerp(circleSize, targetSize, 0.5);
        rectwidth = lerp(rectwidth, rtargetSize, 0.5);
        rectheight = lerp(rectheight, rtargetSize, 0.1);
        rectcolor = lerp(rectcolor, targetcolor, 0.1);
        circolor = lerp(circolor, ctargetcolor, 0.5);

      

      }
    }
  }
}

// DO NOT REMOVE THIS FUNCTION
function connectBtnClick() {
  // If port is not already open, open on click,
  // otherwise close the port
  // (the button label is updated in updateConnectBtn())
  if (!port.opened()) {
    port.open(9600); // opens port with Baud Rate of 9600
  } else {
    port.close();
  }
}

// Keeps the button in sync with the real port state, since opening is
// asynchronous and can fail (picker cancelled, port busy, board unplugged)
function updateConnectBtn() {
  let isOpened = port.opened();
  if (isOpened === wasOpened) return;
  wasOpened = isOpened;

  connectBtn.html(isOpened ? "Disconnect Arduino" : "Connect to Arduino");
  if (isOpened) {
    connectBtn.addClass("connected");
  } else {
    connectBtn.removeClass("connected");
  }
}
