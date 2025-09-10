# Bug: Possible gap in event emission for `servicenow.itsm.records`

## Summary
In some runs, records created between polls are not emitted by the `servicenow.itsm.records` event source. This appears when the source sleeps between polls: a record created during the sleep window is sometimes never delivered as an event on subsequent polls.

We reproduced this both in AAP and by running `ansible-rulebook` on a development machine. Reducing the poll interval to 1 second reduces the misses but does not eliminate them.

## Environment
- AAP 2.5 on RHEL 9 (single-node container)
- Ansible Rulebook 1.1.7, Python 3.11.13, Java 17.0.16
- Collections: `ansible.eda 2.9.0`, `servicenow.itsm 2.12.0`
- Table tested: `sc_request` (likely reproducible on other tables)

## Steps to reproduce (minimal)
1) Rulebook with a short interval and no `updated_since`:
```yaml
# rulebook.yml
---
- name: Respond to ServiceNow catalog request items
  hosts: all
  sources:
    - name: Watch REQs
      servicenow.itsm.records:
        table: sc_request
        interval: 10
  rules:
    - name: debug
      condition: event.meta is defined
      action:
        debug:
```
2) Start the activation and watch logs. Note two consecutive lines of the form:  
   `Polling for new records ... since <timestamp>` – call the timestamps LOWER and UPPER.  
3) While the source is sleeping, create a new `sc_request`.  
4) Confirm the record's `sys_updated_on` is between LOWER and UPPER (ServiceNow is second-precision).  
5) Observe that no event is emitted for that record on later polls.

## Example evidence
```
2025-09-10 09:50:29,044 - drools.ruleset - DEBUG - Ruleset Session ID : 1
2025-09-10 09:50:29,045 - ansible_rulebook.engine - DEBUG - ruleset define: {"name": "Respond to ServiceNow catalog request items", "hosts": ["all"], "sources": [{"EventSource": {"name": "Watch for any updated table", "source_name": "servicenow.itsm.records", "source_args": {"table": "sc_request", "interval": 10}, "source_filters": []}}], "rules": [{"Rule": {"name": "Output ServiceNow Information", "condition": {"AllCondition": [{"IsDefinedExpression": {"Event": "meta"}}]}, "actions": [{"Action": {"action": "debug", "action_args": {"var": "event"}}}], "enabled": true}}]}
2025-09-10 09:50:29,045 - drools.dispatch - DEBUG - Establishing async channel
2025-09-10 09:50:29,062 - ansible_rulebook.engine - INFO - load source servicenow.itsm.records
2025-09-10 09:50:29,769 - ansible_rulebook.engine - INFO - loading source filter eda.builtin.insert_meta_info
2025-09-10 09:50:30,450 - ansible_rulebook.engine - DEBUG - Calling main in servicenow.itsm.records
2025-09-10 09:50:30,451 - <run_path> - INFO - Polling for new records in sc_request since 2025-09-10 09:50:30.451016
2025-09-10 09:50:31,463 - <run_path> - INFO - Sleeping for 10 seconds
2025-09-10 09:50:31,465 - ansible_rulebook.engine - INFO - Waiting for all ruleset tasks to end
2025-09-10 09:50:31,465 - ansible_rulebook.rule_set_runner - INFO - Waiting for actions on events from Respond to ServiceNow catalog request items
2025-09-10 09:50:31,465 - ansible_rulebook.rule_set_runner - INFO - Waiting for events, ruleset: Respond to ServiceNow catalog request items
2025-09-10 09:50:31 465 [drools-async-evaluator-thread] INFO org.drools.ansible.rulebook.integration.api.io.RuleExecutorChannel - Async channel connected
2025-09-10 09:50:41,474 - <run_path> - INFO - Polling for new records in sc_request since 2025-09-10 09:50:40.451103
2025-09-10 09:50:42,460 - <run_path> - INFO - Sleeping for 10 seconds
2025-09-10 09:50:52,470 - <run_path> - INFO - Polling for new records in sc_request since 2025-09-10 09:50:51.474950
2025-09-10 09:50:53,433 - <run_path> - INFO - Sleeping for 10 seconds
2025-09-10 09:51:03,443 - <run_path> - INFO - Polling for new records in sc_request since 2025-09-10 09:51:02.470425 ← LOWER
2025-09-10 09:51:04,848 - <run_path> - INFO - Sleeping for 10 seconds
2025-09-10 09:51:14,858 - <run_path> - INFO - Polling for new records in sc_request since 2025-09-10 09:51:13.443535 ← UPPER
2025-09-10 09:51:15,759 - <run_path> - INFO - Sleeping for 10 seconds
2025-09-10 09:51:25,763 - <run_path> - INFO - Polling for new records in sc_request since 2025-09-10 09:51:24.858002
2025-09-10 09:51:26,714 - <run_path> - INFO - Sleeping for 10 seconds
2025-09-10 09:51:36,725 - <run_path> - INFO - Polling for new records in sc_request since 2025-09-10 09:51:35.763826
2025-09-10 09:51:37,667 - <run_path> - INFO - Sleeping for 10 seconds
^C[ec2-user@ip-10-0-0-4 ~]$ curl -s -u "$SN_USERNAME:$SN_PASSWORD"   "$SN_HOST/api/now/table/sc_request?sysparm_display_value=false&sysparm_fields=number,sys_created_on,sys_id&sysparm_limit=1&sysparm_query=ORDERBYDESCsys_created_on" | jq -r '.result[] | [.number, .sys_created_on, .sys_id] | @tsv'
REQ0010032	2025-09-10 09:51:06	4d6a8013533fa210a33138f0a0490e96
```

As you can see in the above evidence snippet, I have run rulebook, created an event inbetween polls and it does not show in the logs. I have use curl to verify that the REQ has definitely been created and is between the polling gaps. I have added UPPER and LOWER labels to show where the event should have landed.

## Impact
Potential silent data loss: rows created during the sleep window may never produce an event.

## Suspected cause
- The next poll's lower-bound timestamp (`updated_since`) may be advanced to a time in the future relative to the current fetch (e.g., `now + interval`). This would create a blind spot between the fetch and that future bound.
- ServiceNow timestamps are second-precision; if comparisons are performed with microsecond precision on the client side, edge rows on the boundary may be excluded.

## Workarounds observed
- Lowering the interval (e.g., to 1s) narrows the window and reduces misses, but does not fully address the underlying behavior.
- Starting with an `updated_since` set slightly in the past can backfill, at the cost of possible duplicates.
