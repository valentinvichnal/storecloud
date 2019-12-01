# storecloud

## Setup (Google Cloud)
#### Generate a key
1. [Generate a private key](https://cloud.google.com/storage/docs/authentication#generating-a-private-key) and convert it to a `.pem` file using openssl:
```
openssl pkcs12 -in *.p12 -out google-services-private-key.pem -nodes -clcerts
```
2. The password is always "notasecret"
3. Save this file to a directory that clients unable to reach

#### Setup CORS
```
gsutil cors set docs/gs-cors.json gs://mybucket
```
