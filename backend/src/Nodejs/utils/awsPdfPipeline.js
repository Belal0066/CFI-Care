const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

function logAwsStatus(step, status, details = "") {
  const suffix = details ? ` ${details}` : "";
  console.log(`[aws-pdf] step=${step} status=${status}${suffix}`);
}

function isAwsPipelineEnabled() {
  return process.env.AWS_PDF_PIPELINE_ENABLED === "true";
}

function ensureConfig() {
  const required = ["AWS_REGION", "AWS_PDF_BUCKET", "AWS_PDF_SQS_QUEUE_URL"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `AWS PDF pipeline enabled, missing env vars: ${missing.join(", ")}`,
    );
  }
}

function buildS3Key(documentReferenceId) {
  const prefix = (process.env.AWS_PDF_S3_PREFIX || "pdfs").replace(/\/$/, "");
  return `${prefix}/${documentReferenceId}.pdf`;
}

async function uploadToS3({
  pdfId,
  documentReferenceId,
  pdfBuffer,
  contentType,
}) {
  const s3 = new S3Client({ region: process.env.AWS_REGION });
  const bucket = process.env.AWS_PDF_BUCKET;
  const key = buildS3Key(documentReferenceId);

  logAwsStatus(
    "S3_UPLOAD",
    "STARTED",
    `pdfId=${pdfId} documentReferenceId=${documentReferenceId} bucket=${bucket} key=${key}`,
  );

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: pdfBuffer,
      ContentType: contentType || "application/pdf",
    }),
  );

  logAwsStatus(
    "S3_UPLOAD",
    "SUCCESS",
    `pdfId=${pdfId} documentReferenceId=${documentReferenceId} s3Uri=s3://${bucket}/${key}`,
  );

  return { bucket, key };
}

async function publishPdfIdToSqs({
  pdfId,
  patientId,
  documentReferenceId,
  bucket,
  key,
}) {
  const sqs = new SQSClient({ region: process.env.AWS_REGION });
  const queueUrl = process.env.AWS_PDF_SQS_QUEUE_URL;
  const payload = {
    pdfId,
    patientId,
    documentReferenceId,
    bucket,
    key,
    sentAt: new Date().toISOString(),
  };

  const messageInput = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
  };

  if (queueUrl.endsWith(".fifo")) {
    messageInput.MessageGroupId =
      process.env.AWS_PDF_SQS_MESSAGE_GROUP_ID || "pdf-upload";
    messageInput.MessageDeduplicationId = `${pdfId}-${Date.now()}`;
  }

  logAwsStatus(
    "SQS_PUBLISH",
    "STARTED",
    `pdfId=${pdfId} patientId=${patientId || "n/a"} documentReferenceId=${documentReferenceId} queue=${queueUrl}`,
  );

  const result = await sqs.send(new SendMessageCommand(messageInput));
  logAwsStatus(
    "SQS_PUBLISH",
    "SUCCESS",
    `pdfId=${pdfId} documentReferenceId=${documentReferenceId} messageId=${result.MessageId}`,
  );
  return result.MessageId;
}

async function handleAwsPdfPipeline({
  pdfId,
  patientId,
  documentReferenceId,
  pdfBuffer,
  contentType,
}) {
  if (!isAwsPipelineEnabled()) {
    logAwsStatus(
      "PIPELINE",
      "SKIPPED",
      `reason=disabled pdfId=${pdfId} documentReferenceId=${documentReferenceId || "n/a"}`,
    );
    return null;
  }

  try {
    ensureConfig();
    logAwsStatus(
      "PIPELINE",
      "STARTED",
      `pdfId=${pdfId} patientId=${patientId || "n/a"} documentReferenceId=${documentReferenceId}`,
    );

    const { bucket, key } = await uploadToS3({
      pdfId,
      documentReferenceId,
      pdfBuffer,
      contentType,
    });

    const messageId = await publishPdfIdToSqs({
      pdfId,
      patientId,
      documentReferenceId,
      bucket,
      key,
    });

    logAwsStatus(
      "PIPELINE",
      "SUCCESS",
      `pdfId=${pdfId} documentReferenceId=${documentReferenceId} messageId=${messageId}`,
    );

    return {
      bucket,
      key,
      messageId,
    };
  } catch (error) {
    console.error(
      `[aws-pdf] step=PIPELINE status=FAILED pdfId=${pdfId} documentReferenceId=${documentReferenceId || "n/a"} error=${error.message}`,
    );
    throw error;
  }
}

module.exports = {
  handleAwsPdfPipeline,
  isAwsPipelineEnabled,
};
