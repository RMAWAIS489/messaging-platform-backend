import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./User";
import { Conversation } from "./Conversation";

export type MessageType = "text" | "image" | "file" | "audio" | "video";
export type MessageStatus = "sent" | "delivered" | "read";

@Entity("messages")
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  conversationId!: string;

  @Column({ type: "uuid" })
  senderId!: string;

  @Column({ type: "text", nullable: true })
  content!: string | null;

  @Column({ type: "varchar", default: "text" })
  type!: MessageType;

  @Column({ type: "text", nullable: true })
  fileUrl!: string | null;

  @Column({ type: "varchar", nullable: true })
  fileName!: string | null;

  @Column({ type: "int", nullable: true })
  fileSize!: number | null;

  @Column({ type: "uuid", nullable: true })
  replyToId!: string | null; // reply-to message id

  @Column({ type: "boolean", default: false })
  isDeleted!: boolean;

  @Column({ type: "varchar", default: "sent" })
  status!: MessageStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, (u) => u.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "senderId" })
  sender!: User;

  @ManyToOne(() => Conversation, (c) => c.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversationId" })
  conversation!: Conversation;
}
