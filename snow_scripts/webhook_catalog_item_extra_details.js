(function executeRule(current, previous /*null when async*/) {
    try {
        // Create a new REST message instance for the outbound API call
        var r = new sn_ws.RESTMessageV2();

        // Set the endpoint URL for the external service
        r.setEndpoint("<Replace me with your event stream URL");
        // Specify the HTTP method as POST
        r.setHttpMethod("post");

        // Set the Authorization header with the Bearer token
        var token = "<Replace me with your token>";
        r.setRequestHeader("Authorization", "Bearer " + token);

        // Retrieve standard task-specific fields from the current record (sc_task)
        var number = current.getValue("number");
        var short_description = current.getValue("short_description");
        // 'description' is available but not used in the payload here.

        // Initialize variables that will be populated from the associated request item (sc_req_item)
        var requested_for = "";       // Will hold the display value for the requested_for field
        var req_cpu = "";             // Will hold the CPU variable value
        var req_ram = "";             // Will hold the RAM variable value
        var req_storage = "";         // Will hold the Storage variable value
        var req_business_purpose = ""; // Will hold the Business Purpose variable value
        var req_cost_center = "";     // Will hold the Cost Center variable value
        var catalogItemName = "";     // Will hold the catalog item name, if available

        // Get the sys_id of the associated request item from the task record
        var reqItemSysId = current.getValue("request_item");

        // If a request item exists, query the sc_req_item record
        if (reqItemSysId) {
            var reqItem = new GlideRecord('sc_req_item');
            if (reqItem.get(reqItemSysId)) {
                // Retrieve the 'requested_for' field from the sc_req_item record as its display value
                requested_for = reqItem.getDisplayValue("requested_for");

                // Retrieve catalog item variables using getDisplayValue() to extract the actual values
                req_cpu = reqItem.variables.cpu ? reqItem.variables.cpu.getDisplayValue() : "";
                req_ram = reqItem.variables.ram ? reqItem.variables.ram.getDisplayValue() : "";
                req_storage = reqItem.variables.storage ? reqItem.variables.storage.getDisplayValue() : "";
                req_business_purpose = reqItem.variables.business_purpose ? reqItem.variables.business_purpose.getDisplayValue() : "";
                req_cost_center = reqItem.variables.cost_center ? reqItem.variables.cost_center.getDisplayValue() : "";

                // Optionally, retrieve the associated catalog item name if available
                var catItemSysId = reqItem.getValue("cat_item");
                if (catItemSysId) {
                    var catItem = new GlideRecord('sc_cat_item');
                    if (catItem.get(catItemSysId)) {
                        catalogItemName = catItem.getValue("name");
                    }
                }
            }
        }

        // Build the JSON payload with all the gathered data
        var obj = {
            "catalog_item": catalogItemName,
            "req_item_id": reqItemSysId,
            "task_number": number,
            "short_description": short_description,
            "requested_for": requested_for,
            "req_cpu": req_cpu,
            "req_ram": req_ram,
            "req_storage": req_storage,
            "req_business_purpose": req_business_purpose,
            "req_cost_center": req_cost_center
        };

        // Convert the object to a JSON string and log the payload
        var body = JSON.stringify(obj);
        gs.info("Webhook body: " + body);

        // Set the JSON payload as the body of the REST message
        r.setRequestBody(body);

        // Execute the REST call and capture the response status code for logging or error handling
        var response = r.execute();
        var httpStatus = response.getStatusCode();
    } catch (ex) {
        // Log any errors that occur during execution for troubleshooting
        var message = ex.message;
        gs.error("Error message: " + message);
    }

    // Log the HTTP status code of the outbound REST call
    gs.info("Webhook target HTTP status response: " + httpStatus);
})(current, previous);