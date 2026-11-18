// DM2008 — Activity 5a [Guided]
// Colliding Circles (30 min)
//
// A vector stores position and movement together — cleaner than separate x and y variables.
// Your job is to g7et two balls moving, then detect and respond to their collision.
//
// Suggested order:
// 1. Create two Ball objects in setup()
// 2. Check the distance between them in draw()
// 3. Trigger a visual response when they collide
// 4. Implement edge behaviour in move() — wrap or bounce, your choice
//
// Stretch: add a third ball, or make the collision response affect both balls.

let balls = [];

function setup() {
  createCanvas(400, 400);
  // Create two balls at different starting positions
  balls.push(new Ball(100, 200));
  balls.push(new Ball(300, 200));
}

function draw() {
  background(230);

  // Check collision between the two balls
  // dist() measures the distance between their centers
  // They overlap when that distance is less than the sum of their radii

  let d = dist(balls[0].pos.x, balls[0].pos.y, balls[1].pos.x, balls[1].pos.y);
  let colliding = d < balls[0].r + balls[1].r; // true when the balls overlap, false otherwise

  for (let i = 0; i < balls.length; i++) {
    balls[i].move();
    balls[i].show(colliding);
  }
}

class Ball {
  constructor(x, y) {
    // pos and vel are vectors — they store x and y together as one object
    this.pos = createVector(x, y);
    this.vel = createVector(random(-5, 5), random(-5, 5));
    this.r = 50;
  }

  move() {
    // Adding the velocity vector to position moves the ball each frame
    this.pos.add(this.vel);

    // Handle edges — could you make this bounce instead of wrap?
    if (this.pos.x >= width) {
      this.pos.x = width;
      this.vel = this.vel.mult(-1);
    }
    if (this.pos.x <= 0) {
      this.pos.x = 0;
      this.vel = this.vel.mult(-1);
    }
    if (this.pos.y >= height) {
      this.pos.y = height;
      this.vel = this.vel.mult(-1);
    }
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel = this.vel.mult(-1);
    }
  }

  show(colliding) {
    // colliding is true or false — try using it in an if/else to change fill or size
    if(colliding == true){
      push();
      fill(random(0,160), random(0,160), random(100,160), 190);
      triangle(random(this.pos.x+20+height), random(this.pos.y+20), random(this.r * 5+30), random(this.pos.x+width+random(100)));
      pop();
    }else{
      fill(180, 180, 220);
      noStroke();
      ellipse(this.pos.x, this.pos.y, this.r * 2);
    }
  }
}
