ServiceNow incident demo
=========

For this demo, we use ServiceNow business rules to send events to AAP 2.5 (EDA) each time an incident is opened. ServiceNow is the event source which will send a payload to EDA. EDA will be using an Event stream (only available on AAP 2.5>) to listen to listen for the payload. 

General info on Event Streams (simplified event routing)
------------
In AAP 2.5 we have Event Streams. Event streams simplify routing by connecting your sources directly to your rulebooks. They let webhook-based sources trigger one or many rulebook activations without needing separate endpoint configurations. This approach supports horizontal scaling, so any webhook-capable source—like SCMs, ITSMs, or observability tools—can automatically trigger actions when conditions are met.
![alt text](images/event_stream.png "Event Streams")


Demo Setup Instructions
=========

Assumptions
------------
- AAP 2.5 is deployed and default decision environment available
- Service Now Developer instance has been created
- Decision Environment includes `servicenow.itsm` collection at version `2.12.0`

Actions on AAP
------------
We have to create two credentials for this demo. One is a token for the event stream to accept incoming messages, the other is the AAP credential to run a job template.
Log into AAP. Navigate to Automation Decisions > Infrastructure > Credentials. Click Create credential. Give the token a name (SNOW_token), choose an organisation, select 'Token Event Stream'. In the Type Details section, generate a random token and paste it into the Token field (Keep a note of this token somewhere). Leave HTTP Header Key as 'Authorization' (default). Then click 'Create credential'.

![alt text](images/create_token_es_credential.png "Event Streams")

<br>
Now for the second credential, the instructions are the same but adjust the details to suit the screenshot. Remember to append '/api/controller/' to your AAP URL. Finally click 'Create credential'

![alt text](images/create_aap_es_credential.png "Event Streams")

<br>
Create custom ServiceNow credential type (if not present)
------------
If your AAP does not already include a ServiceNow credential type, create one and then add your ServiceNow credential.

1) Create custom credential type

In AAP, navigate to Automation Decisions -> Infrastructure -> Credential Types. Click "Create credential type" and use the following values:

Parameter  Value
Name   ServiceNow ITSM Credential
Description  Description of your credential type
Input Configuration

```yaml
fields:
  - id: instance
    type: string
    label: Instance
  - id: username
    type: string
    label: Username
  - id: password
    type: string
    label: Password
    secret: true
required:
  - instance
  - username
  - password
```

Injector Configuration

```yaml
env:
  SN_HOST: '{{instance}}'
  SN_PASSWORD: '{{password}}'
  SN_USERNAME: '{{username}}'
```

2) Create your ServiceNow Credential

In AAP, navigate to Automation Decisions -> Infrastructure -> Credentials. Click "Create credential" and select the credential type you created above (ServiceNow ITSM Credential). Populate the fields:

- Instance: your ServiceNow instance host (e.g. dev12345.service-now.com)
- Username: your ServiceNow API user
- Password: the user's password (or token if applicable)

Now that we have both tokens created, we can create the Automation Decisions project. Go to Automation Decisions > Projects, click 'Create project'. Enter a name for the project and the Source control URL (This github project). Then click 'Create project'.

![alt text](images/ad_project.png "Event Streams")

<br>

Next we need the Event Stream. Go to Automation Decisions > Event Streams. Click 'Create event stream'. Name the event stream, select 'Token Event Stream' as Event Stream Type, then select 'SNOW Token' as the credential (which we previously created). 'Forward events to rulebooks activation' should be enabled. Then click 'Create event stream'. Copy the URL that is displayed in the newly created event stream. We will need it in the next tasks.
![alt text](images/snow_catalog_event_stream.png "Event Streams")

<br>

Lets test this
------------

Log onto your developer instance of Service Now. Navigate to 'All' > 'System Definition' > 'Scripts - Background'. This will allow you to run a freeform script to ensure the EDA has been setup correctly. Copy and paste the webhook_test_script.js script found in the snow_scripts directory of this repo. Replace 'example-url' with the URL that you copied in the above task. Replace the 'example-token' with the token found in credential you previously created. I have done so, in the example below. Click run and you should see a HTTP responce of 200 returned. 
![alt text](images/test_script_snow.png "Event Streams")

As well as 1 event recieved in your newly created event stream in AAP.
<br>

![alt text](images/event_recieved_test.png "Event Streams")
<br>

ServiceNow Business rule
------------

Setup a business rule in ServiceNow. Navigate to **Activity subscriptions** -> **Administration** -> **Business rules** or just search for **Business rules**. Click "New" to create a new business rule. Fill in the first form:

* Enter a name for the business rule
* Table should be set to **Incident**
* Tick the **Advanced** checkbox

In the **When to Run** section:

* Set action on insert.
* when to run should be "after".
* Add a condition. For example assignment group is equal to "Event Driven Ansible".


![](images/eda_snow_business_rule.png)

On the **advanced** tab, copy the script from webhook_catalog_item.js found under the snow_scripts directory in this repo. Paste the script in the box provided and click save. 
This will send a json payload to EDA which contains the CI name, incident number and incident short description.

**NOTE** make sure you substitute your EDA instance and port number in the example below - this line **r.setEndpoint("http://eda.example.com:5000/endpoint");**

```bash
(function executeRule(current, previous /*null when async*/ ) {
 try {
 var r = new sn_ws.RESTMessageV2();
 // Enter EDA URL and port number here. In this one we have eda.example.com port 5000.
 r.setEndpoint("http://eda.example.com:5000/endpoint");
 r.setHttpMethod("post");

 // some stuff to get ci name instead of id

 var ci = new GlideRecord('cmdb_ci');
 ci.get('sys_id', current.getValue("cmdb_ci"));
 var ci_name = ci.getValue('name');

 var number = current.getValue("number");	
 var short_description = current.getValue("short_description");
 var cmdb_ci = current.getValue("cmdb_ci");	

 var obj = {
 "number": number,
 "short_description": short_description,
 "ci_name": ci_name,

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
```

This was adapted from https://www.transposit.com/devops-blog/itsm/creating-webhooks-in-servicenow/


Quick and easy test
------------

SSH to your EDA controller and install netcat:

```bash
sudo dnf install nc -y
```

Start listening on port 5000

```bash
nc -l 5000
```

Create a ServiceNow Incident using the playbook in this repo or manually. Make sure you actually set a valid CI or it might not work.


You'll see this payload come through to your EDA controller. If this works you can create a rulebook. Examples in this repo.

```bash
$ nc -l 5000
^[[BPOST /endpoint HTTP/1.1
Content-Length: 73
X-SNC-INTEGRATION-SOURCE: b3331a101b02b5941024eb9b2d4bcbfb
User-Agent: ServiceNow/1.0
Host: eda.example.com:5000

{"number":"INC0010004","short_description":"testing","ci_name":"lnux100"}
```


Pat's own notes because he forgets - AAP setup
------------

Edit vault file with ServiceNow and controller details:

```bash
ansible-vault edit group_vars/all/vault.yml 
```

Run the playbook to configure controller:

```bash
ansible-navigator run configure_controller.yml --ask-vault-pass
```

Extra manual steps I haven't automated yet:

* Create a token for eda application and paste into EDA controller
* Create rulebook and project in EDA controller
* Ensure ServiceNow host has relevant CI in the Linux DB
* Add the same CI to the Demo inventory in controller
* Paste the aap users private key into the credential in controller

Troubleshooting
------------
Certs

Ensure the root CA cert exists in System Definition > Certificates in your SNOW instance. Otherwise you will get certificate trust issues when trying to communicate with EDA. 
