import {TaskAccumulator} from '../../../docs/task_accumulator.js';

describe('Unit test for TaskAccumulator', () => {
  it('successfully accumulates all tasks', () => {
    let completedCalled = false;
    const taskAccumulator =
        new TaskAccumulator(5, () => completedCalled = true);
    for (let i = 0; i < 5; i++) {
      expect(completedCalled).to.be.false;
      taskAccumulator.taskCompleted();
    }
    expect(completedCalled).to.be.true;
  });
});
