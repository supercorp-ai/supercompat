import { threadRunInProgress } from "./threadRunInProgress";
import { threadRunFailed } from "./threadRunFailed";
import { threadRunCompleted } from "./threadRunCompleted";
import { threadRunRequiresAction } from "./threadRunRequiresAction";
import { threadRunStepCreated } from "./threadRunStepCreated";
import { threadRunStepDelta } from "./threadRunStepDelta";
import { threadMessageCreated } from "./threadMessageCreated";
import { threadMessageDelta } from "./threadMessageDelta";
import { threadMessageCompleted } from "./threadMessageCompleted";

export const handlers = {
  "thread.run.in_progress": threadRunInProgress,
  "thread.run.failed": threadRunFailed,
  "thread.run.completed": threadRunCompleted,
  "thread.run.requires_action": threadRunRequiresAction,
  "thread.run.step.created": threadRunStepCreated,
  "thread.run.step.delta": threadRunStepDelta,
  "thread.message.created": threadMessageCreated,
  "thread.message.delta": threadMessageDelta,
  "thread.message.completed": threadMessageCompleted,
};
