// DM2008 — Activity 2a [Guided]
// Mode Switch (20 min)
//
// Keys 1, 2, 3 switch between modes — each one changes the background color.
// Try extending each mode to also change the fill, size, or speed of the ellipse.
// Keep it simple: one clear change per mode that's easy to see on screen.
//
// Stretch: add a 4th mode, or make the ellipse change shape between modes.

let x = 0;
let y = 0;// ellipse x-position
let size = 50;   // ellipse size
let bgColor;     // background color, changed by key presses

function setup() {
  createCanvas(400, 400);
  bgColor = color(220);
}

function draw() {
  background(bgColor);
  noStroke();
  // --- Your if/else goes here ---
  // Try swapping this out for your own rule.
  if (mouseIsPressed ) {
4
    switch(key){
      case '1':
        fill(158, 196, 232); 
        break;
      case '2':
        fill(158, 232, 195);
        break;
      case '3':
        fill(232, 217, 158);
        break;
    }
    
  } else {
    fill(0);
  }

  // Draw the ellipse at its current position
  ellipse(x, height / 2, random(size/2,size));
  ellipse(width/2, y, random(size/2,size));
  

  // Move the ellipse
  if (keyPressed && key == "s"){
    x+=30;
    y+=30;
    
  }else{
    x+=1;
    y+=1;
    }
  //x += 1;

  // Wrap around when it exits the right edge
  if (x > width + size / 2 + 1) {
    x = -1;
  }
  if (y > height + size / 2 + 1) {
    y = -1;
  }
}

// Keys 1, 2, 3 change the background color — this is your mode switch
function keyPressed() {
  switch (key) {
    case "s":
      x+=30;
      break
    case "q":
      bgColor = color(200, 100, 100);
      break; // red
    case "w":
      bgColor = color(100, 200, 100);
      break; // green
    case "e":
      bgColor = color(100, 100, 200);
      break; // blue
    default:
      bgColor = color(220); // grey
  }
}
