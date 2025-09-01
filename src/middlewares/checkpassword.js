const checkPasswordExpiry = async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });
  
      if (!user) {
        return next(createError('User not found', 404));
      }
  
      if (new Date() > new Date(user.passwordExpiry)) {
        return res.status(403).json({ message: 'Password expired, please change your password.' });
      }
  
      next();
    } catch (error) {
      next(error);
    }
  };
  
  module.exports = checkPasswordExpiry;
  