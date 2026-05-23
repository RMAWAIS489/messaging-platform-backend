import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { User } from "../entities/User";
import { Message } from "../entities/Message";
import { Conversation } from "../entities/Conversation";
import { ConversationParticipant } from "../entities/ConversationParticipant";
import { Notification } from "../entities/Notification";
import { Status } from "../entities/Status";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  synchronize: true, // auto-creates tables in dev
  logging: false,
  entities: [User, Message, Conversation, ConversationParticipant, Notification, Status],
  migrations: [],
  subscribers: [],
});

export async function testConnection(): Promise<void> {
  await AppDataSource.initialize();
  console.log("✅ Connected to PostgreSQL via TypeORM");
}
