/* MultiFile - A JavaScript library to load multiple files from
   tar archives and json_packed files (see http://gist.github.com/407595)

  Example: Loading multiple images from a tarball.

  MultiFile.load('images.tar', function(xhr) {
    this.files.forEach(function(f) {
      var e = document.createElement('div');
      document.body.appendChild(e);
      var p = document.createElement('p');
      p.appendChild(document.createTextNode(f.filename + " (" + f.length + " bytes)"));
      e.appendChild(p);
      var img = new Image();
      img.src = f.toDataURL();
      e.appendChild(img);
    });
  });

  Example 2: Streaming images from a tarball.

  MultiFile.stream('images.tar', function(f) {
      var e = document.createElement('div');
      document.body.appendChild(e);
      var p = document.createElement('p');
      p.appendChild(document.createTextNode(f.filename + " (" + f.length + " bytes)"));
      e.appendChild(p);
      var img = new Image();
      img.src = f.toDataURL();
      e.appendChild(img);
  });


Copyright (c) 2010 Ilmari Heikkinen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

MultiFile = function(){};

// Load and parse archive, calls onload after loading all files.
MultiFile.load = function(url, onload) {
  var o = new MultiFile();
  o.onload = onload;
  o.load(url);
  return o;
}

// Streams an archive from the given url, calling onstream after loading each file in archive.
// Calls onload after loading all files.
MultiFile.stream = function(url, onstream, onload) {
  var o = new MultiFile();
  o.onload = onload;
  o.onstream = onstream;
  o.load(url);
  return o;
}
MultiFile.prototype = {
  onerror : null,
  onload : null,
  onstream : null,

  load : function(url) {
    var xhr = new XMLHttpRequest();
    var self = this;
    var offset = 0;
    this.files = [];
    var isTar = (/\.tar(\?.*)?$/i).test(url);
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {
        if (xhr.status == 200 || xhr.status == 0) {
          if (isTar)
            offset = self.processTarChunks(xhr.responseText, offset);
          else
            self.processJSONChunks(xhr.responseText);
          if (self.onload)
            self.onload(xhr);
        } else {
          if (self.onerror)
            self.onerror(xhr);
        }
      } else if (xhr.readyState == 3) {
        if (xhr.status == 200 || xhr.status == 0) {
          if (isTar)
            offset = self.processTarChunks(xhr.responseText, offset);
          else
            self.processJSONChunks(xhr.responseText);
        }
      }
    };
    xhr.open("GET", url, true);
    xhr.overrideMimeType("text/plain; charset=x-user-defined");
    xhr.setRequestHeader("Content-Type", "text/plain");
    xhr.send(null);
  },

  onerror : function(xhr) {
    alert("Error: "+xhr.status);
  },

  parseJSON : function(text) {
    this.processJSONChunks(text);
  },
  processJSONChunks : function(text) {
    if (this.files.length == 0) { // processing headers
      var idx = text.indexOf('\n');
      if (idx >= 0) { // got header
        this.files = JSON.parse(text.substring(0,idx));
        this.files.forEach(function(f) { f.offset += idx + 1; })
      }
    }
    if (this.files.length > 0) { // processing data
      var f = null;
      var idx=0;
      for (idx=0; idx<this.files.length; idx++) {
        if (this.files[idx].data == null) {
          f = this.files[idx];
          break;
        }
      }
      while (f && f.data == null && f.offset + f.length <= text.length) {
        f.data = text.substring(f.offset, f.offset + f.length);
        f.toDataURL = this.__toDataURL;
        if (this.onstream) this.onstream(f);
        f = this.files[idx++];
      }
    }
  },

  cleanHighByte : function(s) {
    return s.replace(/./g, function(m) {
      return String.fromCharCode(m.charCodeAt(0) & 0xff);
    });
  },

  parseTar : function(text) {
    this.files = [];
    this.processTarChunks(text, 0);
  },
  processTarChunks : function (responseText, offset) {
    while (responseText.length >= offset + 512) {
      var header = this.files.length == 0 ? null : this.files[this.files.length-1];
      if (header && header.data == null) {
        if (offset + header.length <= responseText.length) {
          header.data = responseText.substring(offset, offset+header.length);
          header.toDataURL = this.__toDataURL;
          offset += 512 * Math.ceil(header.length / 512);
          if (this.onstream)
            this.onstream(header);
        } else { // not loaded yet
          break;
        }
      } else {
        var header = this.parseTarHeader(responseText, offset);
        if (header.length > 0 || header.filename != '') {
          this.files.push(header);
          offset += 512;
          header.offset = offset;
        } else { // empty header, stop processing
          offset = responseText.length;
        }
      }
    }
    return offset;
  },
  parseTarHeader : function(text, offset) {
    var i = offset || 0;
    var h = {};
    h.filename = text.substring(i, i+=100).split("\0", 1)[0];
    h.mode = text.substring(i, i+=8).split("\0", 1)[0];
    h.uid = text.substring(i, i+=8).split("\0", 1)[0];
    h.gid = text.substring(i, i+=8).split("\0", 1)[0];
    h.length = this.parseTarNumber(text.substring(i, i+=12));
    h.lastModified = text.substring(i, i+=12).split("\0", 1)[0];
    h.checkSum = text.substring(i, i+=8).split("\0", 1)[0];
    h.fileType = text.substring(i, i+=1).split("\0", 1)[0];
    h.linkName = text.substring(i, i+=100).split("\0", 1)[0];
    return h;
  },
  parseTarNumber : function(text) {
    // if (text.charCodeAt(0) & 0x80 == 1) {
    // GNU tar 8-byte binary big-endian number
    // } else {
    return parseInt('0'+text.replace(/[^\d]/g, ''));
    // }
  },

  __toDataURL : function() {
    if (this.data.substring(0,40).match(/^data:[^\/]+\/[^,]+,/)) {
      return this.data;
    } else if (MultiFile.prototype.cleanHighByte(this.data.substring(0,10)).match(/\377\330\377\340..JFIF/)) {
      return 'data:image/jpeg;base64,'+btoa(MultiFile.prototype.cleanHighByte(this.data));
    } else if (MultiFile.prototype.cleanHighByte(this.data.substring(0,6)) == "\211PNG\r\n") {
      return 'data:image/png;base64,'+btoa(MultiFile.prototype.cleanHighByte(this.data));
    } else if (MultiFile.prototype.cleanHighByte(this.data.substring(0,6)).match(/GIF8[79]a/)) {
      return 'data:image/gif;base64,'+btoa(MultiFile.prototype.cleanHighByte(this.data));
    } else {
      throw("toDataURL: I don't know how to handle " + this.filename);
    }
  }
}
