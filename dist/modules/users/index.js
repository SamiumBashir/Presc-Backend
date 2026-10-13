"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = exports.Doctor = exports.User = void 0;
var User_1 = require("../../models/User");
Object.defineProperty(exports, "User", { enumerable: true, get: function () { return User_1.User; } });
var Doctor_1 = require("../../models/Doctor");
Object.defineProperty(exports, "Doctor", { enumerable: true, get: function () { return Doctor_1.Doctor; } });
var user_repository_1 = require("../../repositories/user.repository");
Object.defineProperty(exports, "userRepository", { enumerable: true, get: function () { return user_repository_1.userRepository; } });
