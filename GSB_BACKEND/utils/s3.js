const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

const region = process.env.AWS_REGION || 'eu-north-1';
const bucketName = process.env.AWS_BUCKET_NAME || process.env.BUCKET_NAME;

const s3Client = new S3Client({
    region,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.SECRET,
    },
});

const uploadToS3 = async (file) => {
    try {
        const fileExtension = file.originalname.split('.').pop();
        const key = `${uuidv4()}.${fileExtension}`;

        const params = {
            Bucket: bucketName,
            Key: key,
            Body: file.buffer,
        };

        const command = new PutObjectCommand(params);
        await s3Client.send(command);

        const fileUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`;
        console.log(`File uploaded successfully. ${fileUrl}`);
        return fileUrl;
    } catch (error) {
        console.error('Error uploading to S3:', error);
        throw new Error('Failed to upload file to S3');
    }
};

const getSignedUrlForKey = async (key, expiresInSeconds = 300) => {
    const params = {
        Bucket: bucketName,
        Key: key,
    };

    const command = new GetObjectCommand(params);
    return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};

module.exports = { uploadToS3, getSignedUrl: getSignedUrlForKey }