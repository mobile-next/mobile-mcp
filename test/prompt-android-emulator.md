You are running an acceptance test for mobilecli. The output of this prompt must be a json with a simple "pass" boolean. If the test has failed please
also include a "error" field in the json to also explain for a human what is the problem. Lastly, include "steps" which is an array of human readable
steps you took to achieve this task. In "steps" also mention which mcp tools you used. Do not include anything else in the response.

<test>
Assert that there is only one Android emulator connected.
On that Android emulator. List apps and assert "com.mobilenext.Playground" app is installed.
If it's running then terminate it. Now launch "com.mobilenext.Playground" app.
Assert that com.mobilenext.Playground app is in the foreground.
Press HOME button.
Assert that it's not in the foreground anymore, but instead we're back to app launcher.
Launch the app again and save a screenshot to "delete-me.png".
Assert that delete-me.png was created locally on disk, and it's a valid png of at least 512x512 pixels, and 50KB.
Delete "delete-me.png" file.
Take a screenshot and assert that there is an image at the top that looks like two phones, one is red and the other is green.

Click on "Basic UI" button. Assert now that there's an element called "Toggle" on screen.
Press BACK and assert you're in the main menu again. Now click on "Basic UI".

Assert that you see these elements on screen:
- Text field labelled: "Text Field"
- Password field labelled: "Password"
- Multiline text field labelled: "Multiline text"

Click on the first text field, and type "Hello World". List elements on screen and assert you have "Hello World" entered in the text field.

Now swipe up, and make sure you can't see "Text Field" anymore, but instead you see a date selector.
</test>


