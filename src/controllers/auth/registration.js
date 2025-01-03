const validator = require("validator");

const AppError = require("../../errors/appError");

const PendingUser = require("../../models/pending-user");

const userService = require("../../services/userService");
const pendingUserService = require("../../services/pendingUserService");

const catchAsync = require("../../utils/catchAsync");

const {generateConfirmationCode} = require("../../utils/codeGenerator");

const {sendConfirmationEmail} = require("../../utils/mailingServcies");
const manageSessionForUser = require("../../utils/sessionManagement");

exports.postRegistration = catchAsync(async (req, res, next) => {
  const {username, email, password, passwordConfirm, phone, publicKey} =
    req.body;

  const verificationCode = generateConfirmationCode();

  let existingUser = await userService.getUserByUUID(username);
  if (existingUser) {
    return res.status(400).json({error: "Username already exists."});
  }
  existingUser = await userService.getUserByUUID(email);
  if (existingUser) {
    return res.status(400).json({error: "Email already exists."});
  }
  existingUser = await userService.getUserByUUID(phone);
  if (existingUser) {
    return res.status(400).json({error: "Phone already exists."});
  }

  const newUser = new PendingUser({
    username,
    email,
    password,
    passwordConfirm,
    phone,
    verificationCode,
    publicKey,
  });
  await newUser.save();

  await sendConfirmationEmail(
    email,
    username,
    verificationCode,
    process.env.SNDGRID_TEMPLATEID_REGESTRATION_EMAIL
  );

  return res.status(201).json({
    message:
      "Registration successful. Please check your email for the verification code.",
  });
});

exports.postVerify = catchAsync(async (req, res) => {
  const {email, verificationCode} = req.body;

  if (!email) {
    return res.status(400).json({message: "Email is required"});
  }
  if (!verificationCode) {
    return res.status(400).json({message: "Verification code is required"});
  }

  const pendingUser = await pendingUserService.findUserByEmail(email);

  if (!pendingUser) {
    return res
      .status(404)
      .json({message: "User not found or it might be verified already"});
  }

  if (pendingUser.verificationCode !== verificationCode) {
    return res.status(400).json({message: "Invalid verification code"});
  }

  if (pendingUser.codeExpiresAt < new Date()) {
    return res.status(400).json({message: "Verification code has expired"});
  }
  const user = await userService.createUser({
    username: pendingUser.username,
    email: pendingUser.email,
    password: pendingUser.password,
    passwordConfirm: pendingUser.passwordConfirm,
    phone: pendingUser.phone,
    publicKey: pendingUser.publicKey,
  });
  await PendingUser.deleteOne({email});

  if (process.env.NODE_ENV === "test") {
    return res.status(200).json({
      message: "Account verified successfully",
    });
  }

  const {updatedUser, accessToken} = await manageSessionForUser.default(
    req,
    res,
    user
  );

  return res.status(200).json({
    data: {
      updatedUser,
      accessToken,
    },
    status: "Logged in successfully",
  });
});

exports.resendVerification = catchAsync(async (req, res) => {
  const {email} = req.body;
  if (!email) {
    return res.status(400).json({message: "Email is required"});
  }

  const pendingUser = await pendingUserService.findUserByEmail(email);

  if (!pendingUser) {
    return res
      .status(404)
      .json({message: "User not found or already verified"});
  }

  const newVerificationCode = generateConfirmationCode();

  pendingUser.verificationCode = newVerificationCode;
  pendingUser.codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pendingUser.save();

  await sendConfirmationEmail(
    pendingUser.email,
    pendingUser.username,
    newVerificationCode,
    process.env.SNDGRID_TEMPLATEID_REGESTRATION_EMAIL
  );

  return res
    .status(200)
    .json({message: "Verification code resent successfully"});
});
