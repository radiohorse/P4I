// DM2008 — Activity 3b
// One Function Wonder (30 min)
//
// Write a function that draws a shape or group of shapes.
// It should take at least one parameter — try x, y, size, or color.
// Call it several times with different values to create variation.
//
// Ideas: a simple face, a flower, a house, an icon.
// Example: myShape(100, 200, 50); myShape(300, 200, 80);
//
// Stretch: call your function inside a for loop to create a repeating pattern.
let cirsize = 50;
let trisize = 50;
let circolor = '#eebe91'
let tricolor = '#93eccd'
let bgcolor = '#f2e8e8'

function setup() {
  createCanvas(400, 400);
}

function draw() 
{
  noStroke();

  if (keyIsPressed == true && key == '1')
    {
      drawtrimatrix(tricolor, trisize);
      drawcirmatrix(circolor, cirsize);
    }else{
      drawcirmatrix(circolor, cirsize);
      drawtrimatrix(tricolor, trisize);
    }

  
  if (keyIsPressed == true && key == 't')
  {
    background(tricolor)
  }

  if (keyIsPressed == true && key == 'c')
    {
      background(circolor)
    }
  

}

function drawcirmatrix(color, size)
{
  fill(color);
  noStroke();
    
  for (let x = 0; x < width; x += size)
      {
        for (let y = 0; y < height; y += size)
        {
          ellipse(x + size / 2, y + size / 2, size);
        }
        
      }
    
}

function drawtrimatrix(color, size)
{
  fill(color);
  noStroke();

  for (let x = 0; x < width; x += size) 
  {
    for (let y = 0; y < height; y += size) 
    {
      triangle(x, y + size, x + size / 2, y, x + size, y + size);
    }
  }
}

