You are running an acceptance test for mobilecli. The output of this prompt must be a json with a simple "pass" boolean. If the test has failed please
also include a "error" field in the json to also explain for a human what is the problem. Lastly, include "steps" which is an array of human readable
steps you took to achieve this task. In "steps" also mention which mcp tools you used.

Your entire final response must be ONLY that JSON object, and nothing else: no summary sentence before it, no commentary after it, no markdown code
fence around it. The very first character of your response must be "{" and the very last character must be "}".

<test>
Assert that there is only one iOS simulator connected.

Using my iOS simulator. Go to wikipedia and find out what is today's article. Launch the Reminders app. Add a reminder to learn about today's featured
article.

Next, search for NASA's picture of the day, and take a screenshot to explain to me what's in the photo.
</test>


