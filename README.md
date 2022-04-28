# AWS ClamAV Lambda

- [AWS ClamAV Lambda](#aws-clamav-lambda)
  - [Development](#development)
    - [Unit tests](#unit-tests)
  - [Deployment](#deployment)
  - [Known issues](#known-issues)
    - [Invoke Error Access Denied](#invoke-error-access-denied)
    - [First update event needs to be triggered manually](#first-update-event-needs-to-be-triggered-manually)
  - [ToDo](#todo)
    - [Use lambda function independently of a specific bucket.](#use-lambda-function-independently-of-a-specific-bucket)
    - [Automatically run update event on first deployment](#automatically-run-update-event-on-first-deployment)


This repo contains an implementation for a lambda function which uses
[ClamAV](https://www.clamav.net/) to scan for malicious content in files that are
uploaded to a s3 bucket. Definitions are updated every three hours and uploaded to a
separate s3 bucket. By default clamdscan is used for scanning files as it drastically
speeds up scanning subsequent files. On top of that the lambda uses a warmer to prevent
cold starts that also slow down the scanning process.

The lambda is built with docker and managed with Serverless.

## Development

Install the necessary dependencies via

```bash
npm i
```

TypeScript is used to provide a rich development experience. Therefore the modules need
to be compiled prior to deployment with serverless.

Either use

```bash
npm run compile
```

before deployment or use the watch task to always have the most up to date compilation
results:

```bash
npm run watch
```

### Unit tests

Tests can be run using

```bash
npm test
```

There are three tests suites at the moment (lambda handler, VirusScan, ClamAVService).
For every new feature you should write a test.

## Deployment

Deployment is done with the serverless-cli. For that serverless needs to be installed:

```bash
npm i -g serverless
```

Also AWS credentials need to be set before deployment can be started:

```bash
sls config credentials --provider aws --key <aws-key> --secret <aws-secret>
```

The bucket for which the lambda should be invoked and also the bucket where the
definitions should be uploaded to need to be set via the provided `.env` file. Use

```bash
cp .env.dist .env
```

and fill in the specific bucket names. Note that these need to be globally unique

After a correct setup use

```bash
sls deploy
```

to deploy the lambda function.

Logs can be accessed via

```bash
sls logs -f virusScan -t
```

Note that the output stream is sometimes not correctly displayed. In these cases use the
CloudWatch console in your AWS account to access the logs of the lambda function.

## Known issues

### Invoke Error Access Denied

This occurs randomly and somehow specific to pdf-files. The IAMrole configuration could
be not sufficient enough.

### First update event needs to be triggered manually

As the update event is scheduled to happen every three hours there are initially no
virus definitions when the lambda is deployed for the first time. Therefore you cannot
start directly with scanning files. For the moment you can manually trigger the update
event with a separate json-file with the following contents:

```json
{
    "resources": ["update-virus-definitions-schedule"]
}
```

It may be necesseray to use
`arn:aws:events:<region>:<aws-account-number>:rule/update-virus-definitions-schedule`
instead of only `update-virus-definitions-schedule`

If the json-file is saved under the name `updateEvent.json` the event can be trigger
like so:

```bash
sls invoke -f virusScan -p updateEvent.json
```
## ToDo

### Use lambda function independently of a specific bucket.

At the moment you need to declare the buckets for which the lambda function should be
invoked (can be also existing buckets) in the serverless.yml

### Automatically run update event on first deployment

The problem is described in [First update event needs to be triggered
manually](#first-update-event-needs-to-be-triggered-manually).
