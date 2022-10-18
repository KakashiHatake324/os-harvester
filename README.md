``INSTALLATION``
navigate to the project's directory and input the following commands:
- `npm install`
- `npm run build`
- `electron dist/app.js`

example socket request:
```json
{
  "action": "solve",
  "solve": {
    "siteURL": "https://recaptcha-demo.appspot.com/recaptcha-v2-invisible.php&taskid=dnaionasf-dfsdfds&type=v2",
    "siteKey": "6LcmDCcUAAAAAL5QmnMvDFnfPTP4iCUYRk2MwC0-",
    "taskId": "traskncd",
    "captchaTypes": {
      "Checkpoint": false,
      "V2Invisible": false,
      "V2": true,
      "V3": false,
      "V3Enterprise": false
    }
  }
}
```
