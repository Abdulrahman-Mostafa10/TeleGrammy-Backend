const express = require("express");
const {body} = require("express-validator");

const channelController = require("../../controllers/channel/channel");

const isAuth = require("../../middlewares/isAuthenticated");

const router = express.Router();

router.post(
  "/",
  [
    body("name")
      .exists()
      .withMessage("Name field is required")
      .isString()
      .withMessage("Name field must be a string")
      .notEmpty()
      .withMessage("Name field can not be empty"),
  ],
  isAuth,
  channelController.createChannel
);

router
  .route("/:channelId")
  .patch(
    body("name")
      .exists()
      .withMessage("Name field is required")
      .isString()
      .withMessage("Name field must be a string")
      .notEmpty()
      .withMessage("Name field can not be empty"),
    isAuth,
    channelController.updateChannel
  )
  .delete(isAuth, channelController.deleteChannel)
  .get(isAuth, channelController.getChannel);

router
  .route("/:channelId/admins/:subscriberId")
  .patch(isAuth, channelController.promoteSubscriber)
  .delete(isAuth, channelController.demoteAdmin);

router.post(
  "/:channelId/subscribers/:subscriberId",
  isAuth,
  channelController.addSubscriber
);
router.post("/:channelId/join", isAuth, channelController.joinChannel);

router.get("/:channelId/chat", isAuth, channelController.fetchChannelChat);
router.get(
  "/thread/:postId/messages",
  isAuth,
  channelController.fetchThreadsMesssage
);
router.patch("/:channelId/privacy", isAuth, channelController.updatePrivacy);
router.patch(
  "/:channelId/subscriber",
  isAuth,
  channelController.updateSubscriberSettings
);

router.get(
  "/:channelId/participants",
  isAuth,
  channelController.fetchChannelParticipants
);
router.get(
  "/:channelId/invite/:inviteToken",
  isAuth,
  channelController.getChannelByInvite
);

router.get(
  "/:channelId/show/:inviteToken",
  isAuth,
  channelController.showChannelByInvite
);
router.post(
  "/:channelId/invite/:inviteToken",
  isAuth,
  channelController.joinChannelByInvite
);

router.get("/:channelId/invite", isAuth, channelController.getInviteLink);

module.exports = router;
