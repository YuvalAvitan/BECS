import { validationResult } from "express-validator";
import bcrypt from "bcryptjs";
import HttpError from "../models/httpError.js";
import User from "../models/userModel.js";
import Admin from "../models/adminModel.js";
import PasswordResetToken from "../models/passwordReset.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";

export const getUsers = async (req, res, next) => {
  let users;
  try {
    users = await User.find({}, "-password");
  } catch (err) {
    const error = new HttpError(
      "Fetching users failed, please try again later.",
      500
    );
    return next(error);
  }
  res.json({ users: users.map((user) => user.toObject({ getters: true })) });
};

export const signup = async (req, res, next) => {
  console.log(req.body);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422)
    );
  }

  const { firstName, lastName, email, password } = req.body;

  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(password, 12);
  } catch (err) {
    const error = new HttpError(
      "Could not create user, please try again.",
      500
    );
    return next(error);
  }
  const createdUser = new Admin({
    firstName,
    lastName,
    email,
    password: hashedPassword,
  });

  try {
    console.log(createdUser);
    await createdUser.save();
  } catch (err) {
    const error = new HttpError("Signing up failed, please try again.", 500);
    return next(error);
  }

  let token;
  try {
    token = jwt.sign(
      { userId: createdUser.id, email: createdUser.email },
      "supersecret_dont_share",
      { expiresIn: "1h" }
    );
  } catch (err) {
    const error = new HttpError(
      "Signing up failed, please try again later.",
      500
    );
    return next(error);
  }

  res
    .status(201)
    .json({ userId: createdUser.id, email: createdUser.email, token: token });
};

export const login = async (req, res, next) => {
  const { email, password } = req.body;
  console.log("hey");
  let existingUser;

  try {
    existingUser = await Admin.findOne({ email: email });
  } catch (err) {
    const error = new HttpError(
      "Logging in failed, please try again later.",
      500
    );
    return next(error);
  }
  console.log(existingUser);
  if (!existingUser) {
    const error = new HttpError("Your email or password is incorrect", 401);
    // res.send({ message: "Your email or password is incorrect" });
    return next(error);
  }
  let isValidPassword = false;
  try {
    isValidPassword = await bcrypt.compare(password, existingUser.password);
  } catch (err) {
    const error = new HttpError(
      "Could not log you in, please check your credentials and try again.",
      500
    );
    return next(error);
  }

  if (!isValidPassword) {
    const error = new HttpError("Your email or password is incorrect", 401);
    // res.send({ message: "Your email or password is incorrect" });
    return next(error);
  }

  let token;
  try {
    token = jwt.sign(
      { userId: existingUser.id, email: existingUser.email },
      "supersecret_dont_share",
      { expiresIn: "1h" }
    );
  } catch (err) {
    const error = new HttpError(
      "Logging in failed, please try again later.",
      500
    );
    return next(error);
  }

  res.json({
    existingUser,
    token: token,
  });
};

export const forgotPassword = async (req, res, next) => {
  let user;
  user = await User.findOne({ email: req.body.email });
  if (!user) {
    return res.send({ message: "Failed to send reset password email" });
  }

  // Generate a unique password reset token
  const token = crypto.randomBytes(20).toString("hex");

  // Calculate the expiration date of the token (1 hour from now)
  const expirationDate = new Date();
  expirationDate.setHours(expirationDate.getHours() + 1);
  console.log(req.body.email);

  // Store the token in the database
  user.passwordResetToken = token;
  user.passwordResetExpires = expirationDate;
  await user.save();

  // Send an email to the user with the password reset link
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "vickyeaf@gmail.com",
      pass: "fcevjskxhtvcxihy",
    },
  });
  const mailOptions = {
    from: "vickyeaf@gmail.com",
    to: req.body.email,
    subject: "Password reset",
    html: `Click <a href="http://localhost:3000/resetPassword?token=${token}">here</a> to reset your password. This link will expire in 1 hour.`,
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
      res.status(500).json({ message: "Failed to send reset password email" });
    } else {
      console.log(info);
      res.status(200).json({
        message:
          "An email has been sent with instructions to reset your password.",
      });
    }
  });
};

export const resetPassword = async (req, res, next) => {
  const { password, resetToken } = req.body;

  // Find user with matching reset token
  const user = await User.findOne({ passwordResetToken: resetToken });
  if (!user) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }
  console.log("the resetToken is:", resetToken);
  console.log("the users password is:", password);

  // Reset password and clear reset token from database
  user.password = password;
  console.log("user password is:", user.password);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return res.json({ message: "Password reset successfully" });
};
