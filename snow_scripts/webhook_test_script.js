//Background script to test connectivity

(function executeRule(current, previous /*null when async*/) {
  try {
    var r = new sn_ws.RESTMessageV2();
    // Set the EDA endpoint URL
    r.setEndpoint("example-url");
    r.setHttpMethod("post");

    // Set the Authorization header using the provided token
    var token = "example-token";
    r.setRequestHeader("Authorization", "Bearer " + token);


    var obj = {
      "number": "1234",
      "short_description": "test",
      "ci_name": "test"
    };

    var body = JSON.stringify(obj);
    gs.info("Webhook body: " + body);
    r.setRequestBody(body);

    var response = r.execute();
    var httpStatus = response.getStatusCode();
    gs.info("Webhook target HTTP status response: " + httpStatus);
  } catch (ex) {
    gs.error("Error message: " + ex.message);
  }
})(current, previous);