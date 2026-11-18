let showGrid = false;
let invertUIColor = false;

let gridUIColor;
let gridUIColorAlpha;

let mainGrid = 50;
let subGrid = mainGrid / 2;

let cols, subCols;
let rows, subRows;

function helperGrid() {
  if (showGrid) {
    gridLines();
    crossHairs();
    textOverlays();
    noCursor();
  } else {
    cursor();
  }

  if (invertUIColor) {
    gridUIColor = color(255);
    gridUIColorAlpha = color(255, 50);
  } else {
    gridUIColor = color(0);
    gridUIColorAlpha = color(0, 20);
  }
}

function textOverlays() {
  push();
  fill(gridUIColor);
  noStroke();
  textStyle(BOLD);
  textSize(18);
  textAlign(CENTER);
  text("X: " + round(mouseX) + ", " + "Y: " + round(mouseY), width / 2, height / 2);

  textSize(13);
  textStyle(NORMAL);
  textAlign(LEFT);
  text("(0,0)", 10, 20);
  text("(0,height)", 10, height - 10);
  textAlign(RIGHT);
  text("(width,0)", width - 10, 20);
  text("(width,height)", width - 10, height - 10);
  stroke(0);
  pop();
}

function crossHairs() {
  push()
  noStroke();
  fill("red");
  rectMode(CENTER);
  rect(mouseX, mouseY, 2, 20);
  rect(mouseX, mouseY, 20, 2);
  rectMode(CORNER);
  pop();
}

function gridLines() {
  cols = Math.floor(width / mainGrid);
  rows = Math.floor(height / mainGrid);
  
  push();
  for (i = 0; i < cols; i++) {
    for (j = 0; j < rows; j++) {
      noFill();
      stroke(gridUIColorAlpha);
      strokeWeight(1);
      rectMode(CORNER);
      rect((i * width) / cols, (j * height) / rows, mainGrid);
    }
  }
  pop();

  subCols = cols * 2;
  subRows = rows * 2;
  
  push();
  for (i = 0; i < subCols; i++) {
    for (j = 0; j < subRows; j++) {
      noFill();
      stroke(gridUIColorAlpha);
      strokeWeight(0.4);
      rectMode(CORNER);
      rect((i * width) / subCols, (j * height) / subRows, subGrid);
    }
  }
  pop();
}

function keyPressed() {
  if (keyCode === 18) {
    showGrid = !showGrid;
  }
  if (keyCode === 16) {
    invertUIColor = !invertUIColor;
  }
}
