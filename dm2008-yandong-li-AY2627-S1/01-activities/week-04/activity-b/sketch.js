// DM2008 — Activity 4b [Guided]
// Objects in Motion (50 min)
//
// You have a working Agent class to start with — your job is to bring it to life.
// Each agent moves, changes over time, and is drawn to the screen.
// Mouse click adds a new agent. C clears them all.
//
// Things to try:
// - Change the starting values (size, speed, color) to see what happens
// - Make agents bounce instead of wrap — what needs to change?
// - Add a second method to your class beyond update() and show()
//
// Stretch: give each agent a lifespan — shrink or fade it over time, then remove it.
// Hint: a backward loop lets you safely splice items while iterating.

let agents = [];
let minsz = 2;
let maxsz = 10;
const NUM_START = 900;

function setup() {
  createCanvas(600, 400);
  noStroke();

  for (let i = 0; i < NUM_START; i++) {
    let x = random(width);
    let y = random(height);
    let sz = random(minsz, maxsz);
    let speedX = random(-2, 2);
    let speedY = random(-2, 2);
    agents.push(new Agent(x, y, sz, speedX, speedY));
  }
}

function draw() {
  background(230, 20);

  for (let i = 0; i < agents.length; i++) {
    agents[i].update();
    agents[i].showtri();
    agents[i].show();
    agents[i].Age();
  }
  if (mouseIsPressed) {
    let sz = random(minsz, maxsz);
    let speedX = random(-2, 2);
    let speedY = random(-2, 2);
    agents.push(new Agent(mouseX, mouseY, sz, speedX, speedY));
  }

  
}

function mousePressed() {
  let sz = random(minsz * 5, maxsz * 5);
  let speedX = random(-2, 2);
  let speedY = random(-2, 2);
  agents.push(new Agent(mouseX, mouseY, sz, speedX, speedY));
}

function keyPressed() {
  // Replacing the array with an empty one effectively clears all agents
  if (key == "C" || key == "c") {
    agents = [];
  }
  if (key == " ") {
    for (let i = 0; i < agents.length; i++) {
      agents[i].randomfunc();
    }
  }
}

class Agent {
  constructor(x, y, sz, speedX, speedY) {
    this.x = x;
    this.y = y;
    this.sz = sz;
    this.dx = speedX;
    this.dy = speedY;
    this.col = random(255); // a color value that will change over time
    // What else might your agent need to know about itself?
  }

  update() {
    // Position changes by speed each frame — can you see why? yes, bc the next 2 lines
    this.x += this.dx;
    this.y += this.dy;

    // This is a property changing over time — try changing size or speed instead
    this.col = (this.col + 1) % 255;

    // This wraps agents around the edges — could you make them bounce instead?
    if (this.x > width) {
      this.x = width;
      this.dx = -this.dx;
    }
    if (this.x < 0) {
      this.x = 0;
      this.dx = -this.dx;
    }
    if (this.y >= height) {
      this.y = height;
      this.y = -this.y;
    }
    if (this.y <= 0) {
      this.y = 0;
      this.y = -this.y;
    }
  }

  show() {
    // this.col drives the color shift — how could you use your other properties here?
    fill(this.col, 150, 220, 150);
    ellipse(this.x, this.y, this.sz);
    // triangle((this.col+10)%97, this.x, this.col%89 * this.y, (this.col+10)%42, (this.col+3)%73, (this.col+4)%69 );
  }

  showtri() {
    // this.col drives the color shift — how could you use your other properties here?
    fill(this.col + 10, 150, 220, 3);
    triangle(
      (this.col + 10) % 97,
      this.x,
      (this.col % 89) * this.y,
      (this.col + 10) % 42,
      (this.col + 3) % 73,
      (this.col + 4) % 69
    );
  }

  randomfunc() {
    this.dx = this.dx * random(3);
    this.dy = this.dy * random(3);
  }

  Age() {
    if(this.sz>0){
      this.sz = this.sz - 0.03;
    }
      
    if (this.sz < 0){
      this.sz = 0;
    }
   
    
  }
}
