import { Worker } from "bullmq";
import prisma from "../prisma";
import nodemailer from "nodemailer";

const connection = {
  host: "127.0.0.1",
  port: 6379
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD
  }
});

export const notificationWorker = new Worker(
  "notification",
  async job => {
    const { title, message, channel, schoolId, email } = job.data;

    if (channel === "EMAIL") {
      await transporter.sendMail({
        from: process.env.EMAIL,
        to: email,
        subject: title,
        text: message
      });
    }

    await prisma.notification.create({
      data: {
        schoolId,
        title,
        message,
        channel,
        status: "SENT"
      }
    });
  },
  {
    connection
  }
);