export {DocumentLoader};

class StartupTaskTracker {
  constructor(numTasks, callback) {
    this.numTasks = numTasks;
    this.callback = callback;
  }

  noteTaskCompleted() {
    if (--this.numTasks === 0) {
      this.callback();
    }
  }
}

class DocumentLoader {
  constructor(scriptUrls, lastScript) {
    this.callback = () => this.loadModule(lastScript);
    this.startupTaskTracker = new StartupTaskTracker(scriptUrls.length + 1, this.callback);
    for (const item of scriptUrls) {
      if (Array.isArray(item)) {
        this.loadScript(item[0], item[1]);
      } else {
        this.loadScript(item);
      }
    }
  }

  loadScript(url, extraCallback) {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.onload = extraCallback ? () => {
      this.startupTaskTracker.noteTaskCompleted();
      extraCallback();
        } : () => this.startupTaskTracker.noteTaskCompleted();
    script.src = url;
    document.getElementsByTagName('head')[0].appendChild(script);
  }

  loadModule(url) {
    const script = document.createElement("script");
    script.type = "module";
    script.src = url;
    document.getElementsByTagName('head')[0].appendChild(script);
  }

  notePageLoaded() {
    this.startupTaskTracker.noteTaskCompleted();
  }
}
