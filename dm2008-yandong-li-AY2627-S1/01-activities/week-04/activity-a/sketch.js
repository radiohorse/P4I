// DM2008 — Activity 4a [Guided]
// Bake a Cookie (30 min)
//
// A class is a blueprint — Cookie describes what every cookie has and can do.
// Your job is to complete the class, then add movement and a flavor randomizer.
//
// Suggested order:
// 1. Add the missing properties to the constructor (sz, x, y)
// 2. Fix show() so it uses this.flavor, this.x, this.y, this.sz
// 3. Implement move() and randomFlavor()
// 4. Wire them up in keyPressed() and mousePressed()
//
// Stretch: add a second cookie with different starting values.

let cookie;
let flavor = ["chocolate", "vanilla", "strawberry"];

function setup() {
  createCanvas(400, 400);
  noStroke();
  cookie = new Cookie("chocolate", 80, width / 2, height / 2);
}

function draw() {
  background(230);
  cookie.show();
  if (keyIsPressed){
    cookie.move();
  }
}

class Cookie {
  constructor(flavor, sz, x, y) {
    // this. binds each value to this specific cookie object
    // Add the missing properties below
    this.flavor = flavor;
    this.sz = sz;
    this.x = x;
    this.y = y;
  }

  show() {
    // Fix this method — it should use this.flavor, this.x, this.y, this.sz

    switch (this.flavor) {
      case "chocolate":
        fill(196, 146, 96);
        break;
      case "vanilla":
        fill(255, 223, 150);
        break;
      case "strawberry":
        fill(255, 122, 107);
        break;
      default:
        fill(220, 180, 120);
    }
    ellipse(this.x, this.y, this.sz);
  }

  // Add a move() method — update this.x or this.y based on which key is pressed
  move() {
    switch (key) {
      case UP_ARROW:
        this.y += -10;
        break;

      case DOWN_ARROW:
        this.y = this.y + 10;
        break;

      case RIGHT_ARROW:
        this.x += 10;
        break;

      case LEFT_ARROW:
        this.x = this.x - 10;
        break;
    }
  }
  // Add a randomFlavor() method — set this.flavor to one of at least 3 options
  randomFlavor() {
    cookie = new Cookie(random(flavor), 80, this.x, this.y);
    cookie.show();
  }
}

// Call cookie.move() when an arrow key is pressed

/*function keyPressed() {
  cookie.move();
}*/

// Call cookie.randomFlavor() when the mouse is clicked
function mousePressed() {
  cookie.randomFlavor();
}
