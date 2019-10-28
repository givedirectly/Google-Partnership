export {TaskAccumulator as default};

class TaskAccumulator{
  /**
   *
   * @param {number} numTasks
   * @param {function} onCompletion
   */
  constructor(numTasks, onCompletion) {
    this.numTasks = numTasks;
    this.onCompletion = onCompletion;
  }

  taskCompleted() {
    if (--this.numTasks) {
      this.onCompletion();
    }
  }
}
