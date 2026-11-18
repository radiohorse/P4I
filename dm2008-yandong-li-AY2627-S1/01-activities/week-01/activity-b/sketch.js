// DM2008 — Activity 1b [Ryoji Ikeda]
// Learning By Making (30 min)

let x;
let w;
let ex;
let ey;
let a;
let r;

function setup() {
  createCanvas(800, 800);
  background(255);
  noStroke();
  fill(0);
  ex = 0;
  ey = 0;
  a = 50;
  r = 5;
}

function draw() {
  background(255, 10);
  
  x = random(width);
  w = random(1, 10);
  //rect(x, 0, w, height/2);
  //ellipse(ex,ey,w,w);
  ex = ex + 1;
  ey = ey + 1;

  
  x = random(width);
  rect(x, height/2, w, height/2);
}

function keyPressed() {
  saveCanvas("activity1b-image", "jpg");
}

function mouseClicked() {
  if(ex>width/2 == false){
    fill(random(255));
    ellipse(ex-3*a,ey,random(r)*w,random(r)*w);
    ellipse(ex-4*a,ey,random(r)*w,random(r)*w);
    ellipse(ex-5*a,ey,random(r)*w,random(r)*w);
    ellipse(ex-6*a,ey,random(r)*w,random(r)*w);
    ellipse(ex-7*a,ey,random(r)*w,random(r)*w);
    ellipse(ex-8*a,ey,random(r)*w,random(r)*w);
    ellipse(ex-2*a,ey,random(r)*w,random(r)*w);
    ellipse(ex-a,ey,random(r)*w,random(r)*w);
    ellipse(ex,ey,random(r)*w,random(r)*w);
    ellipse(ex+a,ey,random(r)*w,random(r)*w);
    ellipse(ex+2*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+3*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+4*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+5*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+6*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+7*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+8*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+9*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+10*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+11*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+12*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+13*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+14*a,ey,random(r)*w,random(r)*w);
    ellipse(ex+15*a,ey,random(r)*w,random(r)*w);
  }else{
    ex = 0;
    ey = 0;
  }
}