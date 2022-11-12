describe('extended matchers included', () => {
  it('should be able to use extended matchers', () => {
    expect('foo').toSatisfy((string) => string.startsWith('f'));
  });
});
