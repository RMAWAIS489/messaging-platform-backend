import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from "typeorm";
import { User } from "./User";
import { Conversation } from "./Conversation";

export type ParticipantRole = "member" | "admin";

@Entity("conversation_participants")
export class ConversationParticipant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "uuid" })
  conversationId!: string;

  @Column({ type: "varchar", default: "member" })
  role!: ParticipantRole;

  @Column({ nullable: true, type: "timestamp" })
  lastReadAt!: Date | null;

  @CreateDateColumn()
  joinedAt!: Date;

  @ManyToOne(() => User, (u) => u.participations, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @ManyToOne(() => Conversation, (c) => c.participants, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversationId" })
  conversation!: Conversation;
}
