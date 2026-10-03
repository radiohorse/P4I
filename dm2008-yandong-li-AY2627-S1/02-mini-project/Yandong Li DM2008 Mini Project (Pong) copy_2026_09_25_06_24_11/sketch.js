
/* ----------------- Globals ----------------- */
let leftPaddle, rightPaddle, ball;
let leftScore = 0;
let rightScore = 0;
let bgm, duration;

//fft
let fft; let smoothing = 0.8; let bins = 512;
let waveform = []; let r = 100;
let spectrum = [];

// Game states: "playing" or "gameover" — add more if you need them
let gameState = "menu";

/* ----------------- Setup & Draw ----------------- */
async function setup() {
  bgm = await loadSound("Luminous_Dance_cprsd.mp3");
  //bgm = await loadSound("Crash.mp3");
  createCanvas(640, 360);
  noStroke();
  leftPaddle = new Paddle(30, height / 2 - 30, 10, 60);
  rightPaddle = new Paddle(width - 40, height / 2 - 30, 10, 60);
  ball = new Ball(width / 2, height / 2, 12); //r = 5-12

  duration = bgm.duration();

  //fft
  fft = new p5.FFT(bins);
  fft.setInput(bgm);
}

function draw() {
  //fft
  waveform = fft.waveform();
  spectrum = fft.analyze();
  let bass = getBandEnergy(20, 440);
  let high = getBandEnergy(440,1600);

  background(250, map(constrain(high, 0, 1), 0, 1, 100,0.0005 ));
  
  //background(250, map(high, 0,1, 80, 1000);

  
  ball.r = map(constrain(bass, 0, 10), 0, 1, 6, 1000);

  if (gameState == "menu" && gameState != 'playing' && gameState != 'gameover') {
    drawStart();
    if (mouseIsPressed == true) {
      if (mouseButton.left) {
        gameState = "playing";
      }
    }
  }

  if (gameState === "playing") {
    handleInput();

    leftPaddle.update();
    rightPaddle.update();
    ball.update();

    ball.checkWallBounce();
    ball.checkPaddleBounce(leftPaddle);
    ball.checkPaddleBounce(rightPaddle);

    drawCourt();
    leftPaddle.show();
    rightPaddle.show();

    ball.show();
    

    // Display scores — look up textAlign() and textSize() in the p5.js reference
    displayScores();
  }
    //----GAME STATE JUDEMENT----
    stateJudge();
    //-----bgm control------
    bgmCtrl();
}

/* ----------------- Input ----------------- */
function handleInput() {
  // Left paddle: W (up) and S (down) — use keyIsDown() with the key's character
  if (keyIsDown("w")) {
    leftPaddle.vy = -leftPaddle.speed;
  }
  if (keyIsDown("s")) {
    leftPaddle.vy = leftPaddle.speed;
  }
  // Right paddle: UP_ARROW and DOWN_ARROW — same pattern as left paddle
  if (keyIsDown(UP_ARROW)) {
    rightPaddle.vy = -rightPaddle.speed;
  }
  if (keyIsDown(DOWN_ARROW)) {
    rightPaddle.vy = rightPaddle.speed;
  }
}

function keyReleased() {
  leftPaddle.vy = 0;
  rightPaddle.vy = 0;
}

/* ----------------- Classes ----------------- */
class Paddle {
  constructor(x, y, w, h) {
    this.pos = createVector(x, y);
    this.w = w;
    this.h = h;
    this.vy = 0;
    this.speed = 5;
  }

  update() {
    this.pos.y += this.vy;
    this.pos.y = constrain(this.pos.y, 0, height - this.h);
  }

  show() {
    fill(10);
    rect(this.pos.x, this.pos.y, this.w, this.h, 1);
  }
}

class Ball {
  constructor(x, y, r) {
    this.pos = createVector(x, y);
    this.r = r;
    this.xSpeed = 3.5;
    this.ySpeed = 2.0;

    // Give the ball a random starting direction to get it moving
    // this.vel = createVector(0, 0);
    this.vel = createVector(
      random([-1, 1]) * this.xSpeed,
      random([-1, 1]) * this.ySpeed
    );
  }

  update() {
    this.pos.add(this.vel);
  }

  checkWallBounce() {
    // Bounce off top and bottom walls
    if (this.pos.y - this.r <= 0 || this.pos.y + this.r >= height) {
      this.vel.y *= -1;
      this.pos.y = constrain(this.pos.y, this.r, height - this.r);
    }

    // When the ball passes the left or right edge, a player scores
    // Increment the correct score, then call this.reset()
    if (this.pos.x + this.r <= 0) {
      rightScore += 1;
      this.reset();
    }
    if (this.pos.x - this.r >= width) {
      leftScore += 1;
      this.reset();
    }
  }

  checkPaddleBounce(paddle) {
    const withinY =
      this.pos.y > paddle.pos.y && this.pos.y < paddle.pos.y + paddle.h;
    const withinX =
      this.pos.x + this.r > paddle.pos.x &&
      this.pos.x - this.r < paddle.pos.x + paddle.w;

    if (withinX && withinY) {
      if (this.vel.x < 0) {
        this.pos.x = paddle.pos.x + paddle.w + this.r;
      } else {
        this.pos.x = paddle.pos.x - this.r;
      }
      this.vel.x *= -1;

      // Stretch: add angle variation based on where the ball hits the paddle
      this.vel.y += (this.pos.y - paddle.pos.y - paddle.h / 2) * 0.1;
    }
  }

  show() {
    let bass = getBandEnergy(20, 440);
    //fill('#94d1eb');
    fill(map(constrain(bass, 0, 10), 0, 10, 150, 20000), map(constrain(bass, 0, 10), 0, 10, 209, 20000), map(constrain(bass, 0, 10), 0, 10, 305, 20000), map(constrain(bass, 0, 10), 0, 10, 180, 20000));
    circle(this.pos.x, this.pos.y, this.r * 2);
  }

  reset() {
    this.pos.set(width / 2, height / 2);
    // random([-1, 1]) picks randomly from an array — a handy pattern for direction
    this.vel.set(random([-1, 1]) * this.xSpeed, random([-1, 1]) * this.ySpeed);
  }

  stop() {
    this.vel = createVector(0, 0);
  }
}

/* ----------------- UI Helpers ----------------- */
function drawCourt() {
  stroke(80);
  strokeWeight(2);
  for (let y = 10; y < height; y += 18) {
    line(width / 2, y, width / 2, y + 8);
  }
  noStroke();
}

function displayScores() {
  textSize(20);
  textAlign(CENTER);

  //Add font
  textFont("Courier New");
  fill('#292929');
  text(leftScore, width / 3, height / 10);
  text(rightScore, width - width / 3, height / 10);
}

function drawGameOver() {
  push();
  textSize(80);
  textAlign(CENTER);
  textFont("Courier New");
  fill('#292929');

  text("Game Over", width / 2, height / 2);
  pop();

  push();
  textSize(12);
  textAlign(CENTER);
  textFont("Courier New");
  fill(180);

  text("left click to restart", width / 2, height / 2 + height / 4);
}

function drawStart() {
  if (gameState == "playing") {
    return;
  } else {
    //gameState = 'menu';
    //------TITLE-------
    push();
    textSize(80);
    textAlign(CENTER);
    textFont("Courier New");
    fill('#94d1eb');
    text("PONG", width / 2 - width / 8, height / 2);
    pop();
    push();
    textSize(30);
    textAlign(CENTER);
    textFont("Courier New");
    fill('#c2c2c2');
    text("by Dong", width / 2 + width / 6, height / 2);
    pop();
    //------Instructions-------
    push();
    textSize(12);
    textAlign(CENTER);
    textFont("Courier New");
    fill('#94d1eb');
    text(
      "ws for left | arrow keys for right",
      width / 2,
      height / 2 + height / 6
    );
    text("right click to start | middle click to end", width / 2, height / 2 + height / 4);
    pop();
    //-----Credit-----
    push();
    textSize(10);
    textAlign(CENTER);
    textFont("Courier New");
    fill('#c2c2c2');
    text("BGM: Luminous Dance by radiom", width / 2, height / 2 + height / 2.5);
    pop();
  }
}

//---others---
function gg() {
  gameState = "gameover";
  leftScore = 0;
  rightScore = 0;
}

//----bgm----
function bgmCtrl() {
  if (gameState == "playing" && !bgm.playing) {
    bgm.start();
  }
  if (gameState == "gameover") {
    bgm.stop();
  }
  if (gameState == "menu") {
    bgm.stop;
  }
  if (gameState != "gameover") {
    //bgm.onended(drawGameOver);
  }
  bgm.onended(gg);
}

//state judgement
function stateJudge() {
  if (mouseIsPressed === true && gameState != 'menu') {
    if (mouseButton.center) {
      gameState = "gameover";
      ball.stop();
    }
  }

  if (gameState === "gameover") {
    drawGameOver();
    if (mouseIsPressed == true) {
      if (mouseButton.left) {
        leftScore = 0;
        rigtScore = 0;
        gameState = "playing";
        ball.reset();
      }
    }
  }
}

function getBandEnergy(lowHz, highHz) {
  if (spectrum.length === 0) return 0;

  const step = getAudioContext().sampleRate / 2 / spectrum.length;

  const start = constrain(floor(lowHz / step), 0, spectrum.length - 1);
  const end = constrain(floor(highHz / step), start, spectrum.length - 1);

  let sum = 0;
  for (let i = start; i <= end; i++) {
    sum += spectrum[i];
  }

  return sum / (end - start + 1);
}
