import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from "typeorm";
import { User } from "./User";

export type NotificationType = "new_message" | "group_invite" | "mention";

@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "varchar" })
  type!: NotificationType;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "jsonb", nullable: true })
  meta!: Record<string, unknown> | null;

  @Column({ default: false })
  isRead!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => User, (u) => u.notifications, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;
}
