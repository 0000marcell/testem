describe('hello', function(){
    it('should say hello', function(){
        expect(hello()).toBe('hello world')
    })
    it('should not say not hello', function(){
        expect(hello()).toNotBe('not hello world')
    })
    it('should throw exception', function(){
        throw new Error('Crap')
    })
})