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
import { Notification } from "./Notification";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  username!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column({ nullable: true, type: "text" })
  avatar!: string | null;

  @Column({ nullable: true, type: "text" })
  bio!: string | null;

  @Column({ default: false })
  isOnline!: boolean;

  @Column({ nullable: true, type: "timestamp" })
  lastSeen!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ConversationParticipant, (cp) => cp.user)
  participations!: ConversationParticipant[];

  @OneToMany(() => Message, (m) => m.sender)
  messages!: Message[];

  @OneToMany(() => Notification, (n) => n.user)
  notifications!: Notification[];
}
