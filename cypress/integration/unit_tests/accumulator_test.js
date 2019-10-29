describe('Unit test for TaskAccumulator', () => {
  it('succesfully accumulates all tasks', () => {
    let completedCalled = false;
    const taskAccumulator = new TaskAccumulator(5, () => completedCalled = true);
    for (let i = 0; i < 5; i++) {
      taskAccumulator.taskCompleted();
    }
    expect(completedCalled).to.be.true;
  });

  it('never accumulates all tasks', () => {
    let completedCalled = false;
    const taskAccumulator = new TaskAccumulator(5, () => completedCalled = true);
    taskAccumulator.taskCompleted();
    expect(completedCalled).to.be.false;
  });
});