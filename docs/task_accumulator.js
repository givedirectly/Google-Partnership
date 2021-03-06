export {TaskAccumulator};

/** A util class for waiting on multiple async processes to finish. */
class TaskAccumulator {
  /**
   * @constructor
   * @param {number} numTasks
   * @param {function} onCompletion
   */
  constructor(numTasks, onCompletion) {
    this.numTasks = numTasks;
    this.onCompletion = onCompletion;
  }

  /**
   * Registers a task as completed and calls the "on completion" function if all
   * tasks are done.
   */
  taskCompleted() {
    if (--this.numTasks === 0) {
      this.onCompletion();
    }
  }
}
