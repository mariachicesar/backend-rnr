"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const projects_1 = require("../services/projects");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const projects = await (0, projects_1.listProjectsForUser)(req.user.id);
        res.json(projects);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});
exports.default = router;
//# sourceMappingURL=projects.js.map