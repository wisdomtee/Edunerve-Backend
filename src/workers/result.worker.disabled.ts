import { Worker } from "bullmq";
import prisma from "../prisma";
import fs from "fs";
import csv from "csv-parse";
import { calculateResult } from "../utils/result.calculator";

const connection = {
  host: "127.0.0.1",
  port: 6379
};

export const resultWorker = new Worker(
  "result-processing",
  async job => {
    const { filePath, schoolId } = job.data;

    const parser = fs
      .createReadStream(filePath)
      .pipe(csv.parse({ columns: true }));

    for await (const row of parser) {
      const { total, grade } = calculateResult(
        Number(row.continuousAssessment),
        Number(row.examScore)
      );

      await prisma.result.create({
        data: {
          schoolId,
          studentId: row.studentId,
          courseId: row.courseId,
          continuousAssessment: Number(row.continuousAssessment),
          examScore: Number(row.examScore),
          totalScore: total,
          grade,
          term: row.term,
          session: row.session
        }
      });
    }
  },
  { connection }
);