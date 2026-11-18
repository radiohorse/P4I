// DM2008 — Activity 3a [Guided]
// Array Sampler (25 min)
//
// An array stores a list of values — here it's colors, but it could be
// sizes, positions, or anything else.
// Press any key to cycle through the array one item at a time.
//
// Try these:
// - Replace the colors with your own values (sizes, positions, text).
// - Use mousePressed() instead of keyPressed().
// - Use push() to add new items or splice() to remove them.
// - Loop through the whole array to draw all items at once.
//
// Stretch: visualize all items in the array simultaneously instead of one at a time.

let palette = ["#f06449", "#009988", "#3c78d8", "#ffeb3b"];
let sza = [10,20,30,40,50,60,70,80];
let currentIndex = 0;
let sp;
let sz;

function setup() {
  createCanvas(400, 400);
  noStroke();
  sp = 1;
  sz = 200
  
}

function draw() {
  background(220);

  // Draw the ellipse using the current color in the array
  fill(palette[currentIndex]);
  ellipse(width / 2, height / 2, sz);
  if (mouseIsPressed == true)
  {
    sz = sz + sp;
  }else{
    sz = sz - sp;
  }

  if(keyIsPressed== true && key == "s"){
    fill(random(palette));
    
    ellipse(width/2, height/2, 50);
    ellipse(width/4, height/4, 50);
    ellipse(width/4+width/2, height/4+height/2, 50);

  const spacing = width / (palette.length + 1);
    
  for (let i = 0; i < palette.length; i++) {
      fill(palette[i]);                   // use the i-th color
      const x = (i + 1) * spacing;        // position from the loop index
      ellipse(x, height / 2, 60);
    }
    
  }
  
}

// Advance to the next color each time a key is pressed
function keyPressed() {
  currentIndex++; // shorthand for currentIndex += 1

  // Wrap back to the start when we reach the end
  if (currentIndex >= palette.length) {
    currentIndex = 0;
  }

  console.log("Current index:", currentIndex, "→", palette[currentIndex]);
}

