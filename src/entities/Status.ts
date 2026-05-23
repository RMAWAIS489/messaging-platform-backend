import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from "typeorm";
import { User } from "./User";

@Entity("statuses")
export class Status {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "text", nullable: true })
  caption!: string | null;

  @Column({ type: "text", nullable: true })
  mediaUrl!: string | null;

  @Column({ type: "varchar", default: "text" })
  type!: "text" | "image";

  @Column({ type: "varchar", nullable: true })
  backgroundColor!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  // Statuses expire after 24 hours — computed, not stored
  @ManyToOne(() => User, { onDelete: "CASCADE", eager: true })
  @JoinColumn({ name: "userId" })
  user!: User;
}
