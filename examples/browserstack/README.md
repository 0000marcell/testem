BrowserStack Integration
========================

Run your tests on various browsers hosted on Browserstack!

Instructions
------------

1. Get a [BrowserStack](browserstack.com) account.
2. Create a file named `.browserstack.json` in the top of your home directory. This JSON formatted file will contain 3 properties:
    * **username** - your BrowserStack username
    * **password** - your BrowserStack password
    * **key** - you BrowserStack API key, found on the [automated brower testing api page](http://www.browserstack.com/automated-browser-testing-api).
3. Run the command `testem ci -l bs_chrome` to test out the setup with just the Chrome browser hosted BrowserStack.
4. Run `testem ci` to run it on all the listed browsers - see `testem launchers` for the full list.

