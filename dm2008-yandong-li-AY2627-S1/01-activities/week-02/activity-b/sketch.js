// DM2008 — Activity 2b
// Pattern Making (40 min)
//
// Use a for loop to draw a repeating pattern of shapes.
// Add a condition to introduce variation, and one interaction that changes the rule.
//
// Stretch: try a second row, or turn your row into a 2D grid.
let x = 0;  
let x2;// ellipse x-position
let size = 60;   // ellipse size
let bgColor;     // background color, changed by key presses
let speed;

function setup() 
{
  createCanvas(550, 550);
  bgColor = color(156,220,235,35);
  speed = 2;
  x2 = width;
}


function draw() 
{
  noStroke();
  background(bgColor);

  x+=speed;
  x2+=-speed;

  /*for (let i = 0; i < width / 2; i += 50) 
  {
    if (x > width)
    {
      ellipse(x, i+size/3, size/2);
      x-=speed;
    }else
    {
      ellipse(x, i+size/3, size/2);
      x+=speed;
    }
  }*/
  for (let i = 0; i < width / 2; i += 50) 
    {
      ellipse(x, i+size/3 - 10,size/2);
    }
  for (let o = width / 2; o < width; o += 50) 
      {
        ellipse(x2,o+size/3+10,size/2);
      }


  if(x>width && x2<0)
  {
    speed = -speed;
    x = width;
    x2 = 0;
  }
  
  if(x<0 && x2>width)
  {
    speed = -speed;
    x = 0;
    x2 = width;
    
  }
  
  if (mouseIsPressed) 
  {
    speed = speed + 3;
  } else{
    //speed = speed;
  }
  
  if (keyIsPressed)     
  {
    fill (random(255)); 
  }
  // % (modulo) is handy for alternating every other shape
  
}