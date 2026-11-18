// DM2008 — Activity 1a
// Simple Creatures (20 min)

// Run the sketch, then click on the preview to enable keyboard
// Use the 'Option' ('Alt' on Windows) key to view or hide the grid
// Use the 'Shift' key to change overlays between black & white
// Write the code for your creature within the space provided

/* line 


*/


function setup() {
  createCanvas(400, 400);
}

function draw() {
  
  background(221);
  strokeWeight(55);
  line(200,250,200,290);
  
  // Start drawing the shape.
  beginShape();
  fill(235, 228, 0);
  strokeWeight(3);
  stroke(50);
  vertex(100, 100);
  vertex(150, 50);
  vertex(250, 50);
  vertex(300, 100);
  vertex(250, 130);
  vertex(300, 200);
  vertex(250, 250);
  vertex(150, 250);
  vertex(100, 200);
  endShape(CLOSE);

  
  strokeWeight(3);
  fill(255);
  ellipse(225,100,30,30);

  fill(50);
  ellipse(165,270,10,10);
  ellipse(235,270,10,10);
  //ellipse(175,310,25,25);
  //ellipse(225,310,25,25);
    

  helperGrid(); // do not edit or remove this line
}

function keyPressed() {
  saveCanvas("activity1a-image", "jpg");
}


