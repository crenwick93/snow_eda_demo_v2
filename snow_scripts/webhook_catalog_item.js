(function executeRule(current, previous /*null when async*/) {
    try {
        var r = new sn_ws.RESTMessageV2();
        r.setEndpoint("<Replace me with your event stream URL>");
        r.setHttpMethod("post");

        var token = "<Replace me with your token>";
        r.setRequestHeader("Authorization", "Bearer " + token);

        var reqItemSysId = current.getValue("request_item");
        var ritm_number = "";

        if (reqItemSysId) {
            var reqItem = new GlideRecord('sc_req_item');
            if (reqItem.get(reqItemSysId)) {
                ritm_number = reqItem.getValue("number"); // RITM number
            }
        }

        var obj = {
            "ritm_number": ritm_number
        };

        var body = JSON.stringify(obj);
        gs.info("Webhook body: " + body);

        r.setRequestBody(body);
        var response = r.execute();
        var httpStatus = response.getStatusCode();
    } catch (ex) {
        var message = ex.message;
        gs.error("Error message: " + message);
    }

    gs.info("Webhook target HTTP status response: " + httpStatus);
})(current, previous);

