import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { ConversationParticipant } from "./ConversationParticipant";
import { Message } from "./Message";

export type ConversationType = "direct" | "group";

@Entity("conversations")
export class Conversation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", default: "direct" })
  type!: ConversationType;

  @Column({ nullable: true, type: "varchar" })
  name!: string | null; // group name

  @Column({ nullable: true, type: "text" })
  avatar!: string | null; // group avatar

  @Column({ nullable: true, type: "uuid" })
  createdBy!: string | null; // for groups

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ConversationParticipant, (cp) => cp.conversation)
  participants!: ConversationParticipant[];

  @OneToMany(() => Message, (m) => m.conversation)
  messages!: Message[];
}
