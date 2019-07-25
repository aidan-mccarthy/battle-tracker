/**
 * Location object
 * @param {String} name
 * @param {[Number, Number]} coords
 * @param {Boolean} medic
 * @param {Array} units
 */
class Location {
  constructor(name, coords, medic, units) {
    this.name = name;
    this.coords = coords;
    this.medic = medic;
    this.units = units;
  }
}

let setLocs = true;
let canvas, locations, id = 0;
function runTracker(spreadsheetId) {
  /**
   * EXAMPLE: Anzio, 3, USMAPS
   * 'USMAPS': {
   *   coords: [],
   *   m: false,
   *   units: {
   *     'Anzio': {
   *       3: { refresh: true, objId: 1 }
   *     }
   *   }
   * }
   */
  locations = {
    'USMAPS':     {coords:[0.7492,0.1848],m:false,units:{}},
    'J2/J3':      {coords:[0.7654,0.2371],m:false,units:{}},
    'Bull Pond':  {coords:[0.2295,0.6453],m:false,units:{}},
    'Range 3/5':  {coords:[0.5657,0.4065],m:false,units:{}},
    'Range 7/8':  {coords:[0.5115,0.4541],m:false,units:{}},
    'Range 11':   {coords:[0.4670,0.5220],m:false,units:{}},
    'KACH':       {coords:[0.7649,0.1570],m:false,units:{}},
    'USMA':       {coords:[0.8935,0.2224],m:false,units:{}},
    'Buckner':    {coords:[0.3481,0.5549],m:false,units:{}},
    'LRC/Marne':  {coords:[0.3319,0.6191],m:false,units:{}}
  }

  canvas = loadCanvas();
  loadData(spreadsheetId, 'Data!A:D', 'Notes!A:A');
}

/**
 * @param {Number} id 
 * @returns {Object} the map object
 */
function getObjectById(id) {
  let ret;
  canvas.getObjects().forEach(o => {
    if (o.id === id) {
      ret = o;
    }
  });
  return ret;
}

/**
 * LOAD CANVAS
 */
function loadCanvas() {
  // Create canvas object
  let canvas = new fabric.Canvas('map_canvas', {
    width: window.innerWidth * 0.675,
    height: window.innerHeight * 0.65,
    preserveObjectStacking: true
  });

  // Add map to canvas
  fabric.Image.fromURL('assets/map.jpg', function(img) {
    img.scaleToWidth(canvas.getWidth());
    img.selectable = false;
    img.id = id++;
    canvas.add(img);
  });

  // Set zoom functionality
  canvas.on('mouse:wheel', function(act) {
    let delta = -(act.e.deltaY / 200);
    let zoom = canvas.getZoom();

    zoom = zoom + delta;
    if (zoom > 20) zoom = 20;
    else if (zoom < 1) zoom = 1;

    canvas.zoomToPoint({
      x: act.e.offsetX,
      y: act.e.offsetY
    }, zoom);

    act.e.preventDefault();
    act.e.stopPropagation();
  });

  // DEBUG
  // Display coordinates of selected objects
  canvas.on('object:modified', function(act) {
    let obj = act.target;
    let map = canvas.item(0);
    let p = document.getElementById('unit_location');
    let percentLeft = obj.get('left') / map.aCoords.tr.x;
    let percentTop = obj.get('top') / map.aCoords.br.y;
    p.innerText = 'DEBUG\n' +
    'Map\tW: ' + map.aCoords.tr.x + ', H: ' + map.aCoords.br.y + '\n' +
    'Object\tL: ' + obj.get('left') + ', T: ' + obj.get('top') + '\n' +
    'Percent\tX: ' + percentLeft + ', Y: ' + percentTop;
  });

  // Render canvas
  canvas.renderAll();
  return canvas;
}

/**
 * Step 1 in the data update process.
 * @param {String} id id of the spreadsheet
 * @param {String} unitRange range for the unit tab
 * @param {String} notesRange range for the notes tab 
 */
function loadData(id, unitRange, notesRange) {
  // Wait for Google Sheets API to load
  if (!gapi.client || !gapi.client.sheets) {
    setTimeout(loadData, 1000, id, unitRange, notesRange);
    return false;
  }

  // GET request for unit data
  gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: unitRange
  }).then(function(response) {
    // Array of Arrays => [Unit, # PAX, Location, Time]
    let values = response.result.values;

    loadUnits(values);
    renderTable(values);
  }, function(response) {
    alert('Error: ' + response.result.error.message);
    return false;
  });

  // GET request for notes data
  gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: notesRange
  }).then(function(response) {
    // List of notes items
    let values = response.result.values;
    let [title, ...items] = values;

    renderNotes(title, items);
  }, function(response) {
    alert('Error: ' + response.result.error.message);
    return false;
  });

  // Update every 30 seconds
  setTimeout(loadData, 30*1000, id, unitRange, notesRange);
}

/**
 * Step 2 in the data update process.
 * Formatted as: [Unit, #PAX, Location, Time]
 * @param {Array} data array of arrays
 */
function loadUnits(data) {
  // Check coordinates
  if (setLocs) {
    let map = canvas.item(0);
    for (loc in locations) {
      locations[loc]['coords'][0] *= map.aCoords.tr.x;
      locations[loc]['coords'][1] *= map.aCoords.br.y;
    }
    setLocs = false;
  }

  // Prime saved data for refresh
  for (loc in locations) {
    let units = locations[loc]['units'];
    for (unit in units) {
      let nums = units[unit];
      for (num in nums) {
        nums[num]['refresh'] = false;
      }
    }
  }

  // Add updates to saved data
  let numUnits = data.length;
  for (let i = 0; i < numUnits; i++) {
    let unit = data[i][0];
    let num = data[i][1];
    let loc = data[i][2];

    if (locations.hasOwnProperty(loc)) {
      let setLoc = locations[loc];
      // Medic
      if (unit == 'Medic') {
        setLoc['m'] = true;
      }

      // Normal
      else {
        // Unit present at location
        if (setLoc['units'].hasOwnProperty(unit)) {
          let setUnit = setLoc['units'][unit];
          // Size present at location
          if (setUnit.hasOwnProperty(num)) {
            setUnit[num]['refresh'] = true;
          }
          // Size not present at location
          else {
            setUnit[num] = { refresh: true }
          }
        }
        // Unit not present at location
        else {
          setLoc['units'][unit] = {};
          setLoc['units'][unit][num] = { refresh: true };
        }
      }
    }
  }
  renderUnits();
}

/**
 * Step 2b in the data update process.
 */
function renderUnits() {
  function renderUnit(unit, number, coords, id) {
    let size;
    if (number < 5) size = "team";
    else if (number < 13) size = "squad";
    else if (number < 25) size = "section";
    else if (number < 45) size = "platoon";
    else size = "company";
    let url = 'assets/' + unit.toLowerCase() + '_' + size.toString() + '.svg';
    fabric.loadSVGFromURL(url,
      function(objects, options) {
        let shape = fabric.util.groupSVGElements(objects, options);
        shape.scaleToWidth(canvas.getWidth() * 0.025);
        shape.setShadow('0px 0px 15px black');
        shape.left = coords[0];
        shape.top = coords[1];
        shape.id = id;
        canvas.add(shape);
        canvas.renderAll();
      }
    );
  }

  for (loc in locations) {
    let units = locations[loc]['units'];
    let count = 0, shift = 15;
    for (unit in units) {
      let nums = units[unit];
      for (num in nums) {
        // Render unit
        if (nums[num]['refresh']) {
          let coords = locations[loc]['coords'];
          let xy = [coords[0] - shift * count, coords[1]];
          if (!nums[num].hasOwnProperty('objId')) {
            nums[num]['objId'] = id;
            renderUnit(unit, num, coords, id++);
            //console.log("set objId to: " + nums[num]['objId']);
            //console.log("Adding " + unit + " " + num + " at " + coords + ", " + loc);
          } else {
            let obj = getObjectById(nums[num]['objId']);
            canvas.bringToFront(obj);
            obj.left = xy[0];
            obj.top = xy[1];
          }
          count++;
        }
        // Delete unit
        else {
          let obj = getObjectById(nums[num]['objId']);
          canvas.remove(obj);
          delete nums[num];
        }
      }
    }
  }
}

/**
 * Step 3 in the data update process.
 * Formatted as: [Unit, #PAX, Location, Time]
 * @param {Array} data Rows of the table
 */
function renderTable(data) {
  let table = document.getElementById('battle_table');
  if (!table) {
    setTimeout(renderTable, 1000, data);
    return false;
  }
  let oldSize = table.rows.length;
  let newSize = data.length;

  // Populate table
  let i;
  for (i = 0; i < newSize; i++) {
    if (i >= oldSize) table.insertRow(-1);
    for (var j = 0; j < 4; j++) {
      if (!table.rows[i].cells[j]) table.rows[i].insertCell(-1);
      table.rows[i].cells[j].innerHTML = data[i][j];
    }
  }

  // Clear empty rows
  for (i; i < oldSize; i++) {
    table.deleteRow(i);
  }

  // Add color
  for (i = 0; i < newSize; i++) {
    switch(table.rows[i].cells[0].innerHTML) {
      case "BN":
        table.rows[i].style.backgroundColor = 'rgba(0,255,0,.5)';
        break;
      case "Anzio":
        table.rows[i].style.backgroundColor = 'rgba(255,127,0,.5)';
        break;
      case "Bastogne":
        table.rows[i].style.backgroundColor = 'rgba(255,0,0,.5)';
        break;
      case "Carentan":
        table.rows[i].style.backgroundColor = 'rgba(0,0,255,.5)';
        break;
    }
  }
}

/**
 * Step 4 in the data update process.
 * @param {[String]} head Array with single title index
 * @param {Array} data List of notes items
 */
function renderNotes(title, items) {
  let list = document.getElementById('notes_list');
  if (!list) {
    setTimeout(renderNotes, 1000, title, items);
    return false;
  }

  // Clear list
  let i;
  var oldItems = document.querySelectorAll('li');
  for (i = 0; i < oldItems.length; i++) {
    list.removeChild(oldItems[i]);
  }

  // Populate list
  var newLen = items.length;
  for (i = 0; i < newLen; i++) {
    var li = document.createElement('li');
    li.innerHTML = items[i][0];
    list.appendChild(li);
  }
}
