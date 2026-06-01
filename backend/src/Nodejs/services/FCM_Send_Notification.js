const express = require('express');
const { requireApiAuth } = require('../middleware/requireApiAuth');


const redis = require('../utils/redisOTPCli');

const admin = require('firebase-admin');



async function getFCMToken(patientId) {
  const token = await redis.get(`fcm_token:${patientId}`);
  return token;
  
}

const bodyByType = {
      practitioner: "A practitioner is requesting access to your health data.",
      caregiver: "A caregiver is requesting access to your health data.",
    };


async function sendNotif(patientId, handshakeId , requesterType) {

  // TODO: Send an FCM push notification to the patient here so their app
    // receives the access request instantly (type: 'grant_request').
    //
    // Prerequisites:
    //   - The patient's device must have POSTed its FCM token to the backend
    //     after login (see navigation_bar.dart → setupInteractedMessage).
    //   - Store it in Redis when received, e.g.:
    //       redis.set(`fcm_token:${patientId}`, fcmToken)
    //
    // How to send the notification (Firebase Admin SDK):
    //
    //   const admin = require('firebase-admin');          // init once in app.js
    //
    //   const patientFcmToken = await redis.get(`fcm_token:${patientId}`);
    //   if (patientFcmToken) {
    //     await admin.messaging().send({
    //       token: patientFcmToken,
    //       data: { type: 'grant_request', handshakeId },   // data-only message
    //       notification: {                                  // shown in system tray
    //         title: 'Access Request',
    //         body:  'A doctor is requesting access to your health data.',
    //       },
    //       android: { priority: 'high' },
    //       apns:    { payload: { aps: { contentAvailable: true } } },
    //     });
    //   }
    
    // Send FCM push notification to patient
    const patientFcmToken = await getFCMToken(patientId);

    const body= bodyByType[requesterType];
    
    if (patientFcmToken) {
      await admin.messaging().send({
        token: patientFcmToken,
        data: { type: 'grant_request', handshakeId },
        notification: {
          title: 'Access Request',
          // body: 'A doctor is requesting access to your health data.',
          body:body
        },
        android: { priority: 'high' },
        apns: { payload: { aps: { contentAvailable: true } } },
      });
    }
  
}

module.exports={sendNotif};